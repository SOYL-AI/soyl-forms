-- Server-only application role. Every creator query uses a transaction-local
-- identity resolved from a durable session; pooled connections cannot retain it.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='soyl_app') then
    create role soyl_app nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end $$;
create schema platform;
revoke all on schema platform from public;
alter default privileges in schema platform revoke execute on functions from public;
grant usage on schema public, platform to soyl_app;

create function platform.actor_id() returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
  select id from public.app_users where id=nullif(current_setting('app.user_id',true),'')::uuid and status='active';
$$;
create function platform.workspace_role(p_workspace uuid) returns public.member_role
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select m.role from public.workspace_members m join public.workspaces w on w.id=m.workspace_id
  where m.workspace_id=p_workspace and m.user_id=platform.actor_id() and w.status='active';
$$;
create function platform.can_access(p_workspace uuid,p_minimum public.member_role default 'viewer') returns boolean
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select coalesce(array_position(array['viewer','editor','admin','owner']::public.member_role[],platform.workspace_role(p_workspace))
    >=array_position(array['viewer','editor','admin','owner']::public.member_role[],p_minimum),false);
$$;
revoke all on function platform.actor_id(),platform.workspace_role(uuid),platform.can_access(uuid,public.member_role) from public;
grant execute on function platform.actor_id(),platform.workspace_role(uuid),platform.can_access(uuid,public.member_role) to soyl_app;

-- Explicit grants; tables not listed remain inaccessible, including all identity
-- tables, provider secrets, API-key hashes, billing events and outbox internals.
grant select on workspaces,workspace_members,profiles,forms,form_versions,subscriptions,usage_monthly,
  submissions,uploaded_files,ai_credits,ai_credit_ledger,brand_kits,plans,platform_settings to soyl_app;
grant insert,update,delete on forms to soyl_app;
grant update(display_name,avatar_url,updated_at) on profiles to soyl_app;
grant update(answers,tags,edited_at,status,deleted_at) on submissions to soyl_app;
grant insert,update,delete on brand_kits to soyl_app;

-- Enable RLS even on historical tables that were formerly service-role-only.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',t.tablename);
  end loop;
end $$;
create policy own_profile_read on profiles for select to soyl_app using(id=platform.actor_id());
create policy own_profile_update on profiles for update to soyl_app using(id=platform.actor_id()) with check(id=platform.actor_id());
create policy workspace_read on workspaces for select to soyl_app using(platform.can_access(id));
create policy membership_read on workspace_members for select to soyl_app using(user_id=platform.actor_id() or platform.can_access(workspace_id));
create policy forms_read on forms for select to soyl_app using(platform.can_access(workspace_id));
create policy forms_insert on forms for insert to soyl_app with check(platform.can_access(workspace_id,'editor') and created_by=platform.actor_id() and status='draft' and published_version_id is null);
create policy forms_update on forms for update to soyl_app using(platform.can_access(workspace_id,'editor')) with check(platform.can_access(workspace_id,'editor'));
create policy forms_delete on forms for delete to soyl_app using(platform.can_access(workspace_id,'editor'));
create policy versions_read on form_versions for select to soyl_app using(exists(select 1 from forms f where f.id=form_id and platform.can_access(f.workspace_id)));
create policy subscriptions_read on subscriptions for select to soyl_app using(platform.can_access(workspace_id));
create policy usage_read on usage_monthly for select to soyl_app using(platform.can_access(workspace_id));
create policy submissions_read on submissions for select to soyl_app using(platform.can_access(workspace_id));
create policy submissions_update on submissions for update to soyl_app using(platform.can_access(workspace_id,'editor')) with check(platform.can_access(workspace_id,'editor'));
create policy uploads_read on uploaded_files for select to soyl_app using(platform.can_access(workspace_id));
create policy credits_read on ai_credits for select to soyl_app using(platform.can_access(workspace_id));
create policy credit_ledger_read on ai_credit_ledger for select to soyl_app using(platform.can_access(workspace_id));
create policy brand_read on brand_kits for select to soyl_app using(platform.can_access(workspace_id));
create policy brand_insert on brand_kits for insert to soyl_app with check(platform.can_access(workspace_id,'editor') and created_by=platform.actor_id());
create policy brand_update on brand_kits for update to soyl_app using(platform.can_access(workspace_id,'editor')) with check(platform.can_access(workspace_id,'editor'));
create policy brand_delete on brand_kits for delete to soyl_app using(platform.can_access(workspace_id,'editor'));
create policy plans_read on plans for select to soyl_app using(true);
create policy flags_read on platform_settings for select to soyl_app using(key='flags');

-- Publishing fields can only change through the locked publish function. Ordinary
-- draft updates cannot point a form at another form's version or publish a draft.
revoke update on forms from soyl_app;
grant update(title,slug,status,draft_schema,draft_revision,theme,settings,branding,brand_kit_id,updated_at) on forms to soyl_app;
create function platform.guard_form_update() returns trigger
language plpgsql set search_path=pg_catalog,public,platform as $$
begin
  if current_user='soyl_runtime' and new.status='published' and old.status<>'published' then
    raise exception 'Use the authorized publish operation' using errcode='42501';
  end if;
  if new.brand_kit_id is not null and not exists(select 1 from public.brand_kits b where b.id=new.brand_kit_id and b.workspace_id=new.workspace_id) then
    raise exception 'Brand kit is outside the form workspace' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function platform.guard_form_update() from public;
create trigger form_update_guard before insert or update on forms for each row execute function platform.guard_form_update();

create function platform.ensure_personal_workspace(p_welcome_credits integer)
returns table(workspace_id uuid,created boolean)
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
declare v_user uuid:=platform.actor_id(); v_workspace uuid; v_email text; v_name text; v_flags jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_welcome_credits not between 0 and 100 then raise exception 'Invalid welcome credit allocation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||v_user,0));
  select m.workspace_id into v_workspace from public.workspace_members m where m.user_id=v_user order by m.created_at,m.workspace_id limit 1;
  if v_workspace is not null then return query select v_workspace,false; return; end if;
  select value into v_flags from platform_settings where key='flags';
  if coalesce((v_flags->>'registrationsEnabled')::boolean,true)=false then raise exception 'Registrations paused'; end if;
  select email,display_name into v_email,v_name from app_users where id=v_user;
  insert into workspaces(name,slug,owner_user_id)
    values(coalesce(nullif(v_name,''),nullif(split_part(v_email,'@',1),''),'Personal')||'''s workspace','u-'||v_user,v_user)
    returning id into v_workspace;
  insert into workspace_members(workspace_id,user_id,role) values(v_workspace,v_user,'owner');
  insert into profiles(id,display_name) values(v_user,v_name) on conflict(id) do nothing;
  insert into subscriptions(workspace_id) values(v_workspace);
  perform platform_private.grant_ai_credits(v_workspace,p_welcome_credits,'welcome','signup');
  return query select v_workspace,true;
end $$;

create function platform.publish_form(p_form_id uuid,p_schema jsonb,p_theme jsonb,p_settings jsonb,p_max_active integer)
returns table(version_id uuid,version_number integer)
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
declare v_workspace uuid; v_status public.form_status;
begin
  select workspace_id into v_workspace from forms where id=p_form_id;
  if v_workspace is null or not platform.can_access(v_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  -- Match submission/upload lock order and serialize active-form quota checks.
  perform 1 from workspaces where id=v_workspace for update;
  select status into v_status from forms where id=p_form_id and workspace_id=v_workspace for update;
  if p_max_active is null or p_max_active<1 then raise exception 'Invalid form limit'; end if;
  if (select count(*) from forms where workspace_id=v_workspace and status='published' and id<>p_form_id)>=p_max_active then
    raise exception 'Active form limit reached';
  end if;
  return query select * from platform_private.publish_form(p_form_id,p_schema,p_theme,p_settings,platform.actor_id());
end $$;

create function platform.resolve_public_form(p_slug text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',f.id,'workspace_id',f.workspace_id,'title',f.title,'slug',f.slug,'status',f.status,
    'version_id',v.id,'version_number',v.version_number,'schema',v.schema,'settings',v.settings,'theme',v.theme)
  from forms f join workspaces w on w.id=f.workspace_id join form_versions v on v.id=f.published_version_id and v.form_id=f.id
  where f.slug=p_slug and f.status in ('published','closed') and w.status='active';
$$;
create function platform.resolve_form_version(p_form_id uuid,p_version_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',v.id,'version_number',v.version_number,'schema',v.schema,'settings',v.settings,'theme',v.theme)
  from form_versions v join forms f on f.id=v.form_id join workspaces w on w.id=f.workspace_id
  where v.id=p_version_id and f.id=p_form_id and f.status in ('published','closed') and f.published_version_id is not null and w.status='active';
$$;

-- No table rights are granted for respondents. Only validated server calls use
-- these narrow operations; the private submit function preserves atomic effects.
create function platform.submit_response(p_form_id uuid,p_workspace_id uuid,p_version_id uuid,p_idempotency_key text,p_answers jsonb,p_hidden jsonb,
  p_source text,p_duration_ms bigint,p_monthly_limit bigint,p_session_id text default null,p_resume_token text default null)
returns jsonb language sql security definer set search_path=pg_catalog,public,platform_private as $$
  select platform_private.submit_form_safe(p_form_id,p_workspace_id,p_version_id,p_idempotency_key,p_answers,p_hidden,p_source,p_duration_ms,p_monthly_limit,p_session_id,p_resume_token);
$$;
create function platform.consume_rate_limit(p_key text,p_limit integer,p_window_ms integer) returns jsonb
language sql security definer set search_path=pg_catalog,public,platform_private as $$
  select platform_private.consume_rate_limit(p_key,p_limit,p_window_ms);
$$;

revoke all on all functions in schema platform from public;
grant execute on function platform.ensure_personal_workspace(integer),platform.publish_form(uuid,jsonb,jsonb,jsonb,integer),
  platform.resolve_public_form(text),platform.resolve_form_version(uuid,uuid),
  platform.submit_response(uuid,uuid,uuid,text,jsonb,jsonb,text,bigint,bigint,text,text),
  platform.consume_rate_limit(text,integer,integer) to soyl_app;
