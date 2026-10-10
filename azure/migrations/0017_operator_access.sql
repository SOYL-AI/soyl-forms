-- Operators have explicit read policies on business records, never identity
-- tokens, API-key hashes or encrypted payment/webhook credentials.
grant select on audit_logs,webhook_deliveries,razorpay_webhook_events,admin_users to soyl_app;
do $$ declare v_table text;begin
  foreach v_table in array array['profiles','workspaces','workspace_members','forms','form_versions','subscriptions','usage_monthly',
    'submissions','uploaded_files','ai_credits','ai_credit_ledger','brand_kits','audit_logs','webhook_deliveries','razorpay_webhook_events','admin_users'] loop
    execute format('create policy operator_read on public.%I for select to soyl_app using ((select platform.admin_role()) is not null)',v_table);
  end loop;
end $$;

create function platform.operator_users(p_query text default '',p_ids uuid[] default null,p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,email text,email_verified boolean,created_at timestamptz,last_sign_in_at timestamptz,status text,identities jsonb)
language plpgsql stable security definer set search_path=pg_catalog,public,identity,platform as $$
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  return query select u.id,u.email,u.email_verified,u.created_at,
    (select max(s.created_at) from identity.sessions s where s.user_id=u.id),u.status,
    case when exists(select 1 from identity.provider_identities p where p.user_id=u.id) then '[{"provider":"Entra External ID"}]'::jsonb else '[]'::jsonb end
    from app_users u where (p_ids is null or u.id=any(p_ids))
    and (coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')),lower(p_query))>0 or strpos(u.id::text,lower(p_query))>0)
    order by u.created_at desc,u.id limit least(greatest(p_limit,1),100) offset least(greatest(p_offset,0),1000000);
end $$;
create function platform.operator_user_counts() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,platform as $$
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  return (select jsonb_build_object('users',count(*),'users7d',count(*) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '7 days'),
    'users30d',count(*) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '30 days'),
    'signups',coalesce((select jsonb_agg(jsonb_build_object('at',day,'count',n)) from(select (created_at at time zone 'UTC')::date::text as day,count(*) as n from app_users where created_at>=now()-interval '31 days' group by 1) d),'[]')) from app_users);
end $$;
create function platform.operator_outbox_summary() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,platform as $$
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  return (select coalesce(jsonb_object_agg(status,n),'{}') from(select status,count(*) as n from outbox_events
    where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' group by status) x);
end $$;

create function platform.moderate_workspace(p_workspace uuid,p_status workspace_status,p_reason text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  update workspaces set status=p_status,updated_at=now() where id=p_workspace;
  if not found then return false; end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(platform.actor_id(),'admin',p_workspace,case when p_status='active' then 'workspace.reactivate' else 'workspace.suspend' end,'workspace',p_workspace::text,jsonb_build_object('reason',left(p_reason,300)));
  return true;
end $$;
create function platform.moderate_form(p_form uuid,p_suspend boolean,p_reason text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_workspace uuid;
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  select workspace_id into v_workspace from forms where id=p_form;
  perform 1 from workspaces where id=v_workspace for update;
  update forms set status=(case when p_suspend then 'closed' when published_version_id is not null then 'published' else 'draft' end)::form_status,updated_at=now() where id=p_form;
  if not found then return false; end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(platform.actor_id(),'admin',v_workspace,case when p_suspend then 'form.suspend' else 'form.reactivate' end,'form',p_form::text,jsonb_build_object('reason',left(p_reason,300)));
  return true;
end $$;

-- Keep overrides independent from the provider's billed plan: webhook updates
-- and override expiry must not accidentally create paid entitlements.
alter table subscriptions add column override_plan_code text references plans(code);
update subscriptions set override_plan_code=plan_code where override_reason is not null;
create function platform.set_override(p_workspace uuid,p_plan text,p_reason text,p_expires timestamptz) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if platform.admin_role() is distinct from 'super_admin'::admin_role then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_plan is not null and (p_plan not in ('free','starter','pro') or length(trim(p_reason))<5 or p_expires is null or p_expires<=now()) then raise exception 'A reason and future expiry are required'; end if;
  perform 1 from workspaces where id=p_workspace for update;
  update subscriptions set override_plan_code=p_plan,override_reason=case when p_plan is null then null else left(trim(p_reason),1000) end,
    override_expires_at=case when p_plan is null then null else p_expires end,updated_at=now() where workspace_id=p_workspace;
  if not found then return false; end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(platform.actor_id(),'admin',p_workspace,case when p_plan is null then 'billing.override.clear' else 'billing.override' end,'workspace',p_workspace::text,jsonb_build_object('plan',p_plan,'reason',p_reason,'expiresAt',p_expires));
  return true;
end $$;
create or replace function platform.public_form_plan(p_form_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
  select case
    when s.override_reason is not null and s.override_reason<>'' and (s.override_expires_at is null or s.override_expires_at>statement_timestamp()) then coalesce(s.override_plan_code,s.plan_code)
    when s.status in ('authenticated','active') then s.plan_code else 'free' end
  from forms f join workspaces w on w.id=f.workspace_id left join subscriptions s on s.workspace_id=w.id
  where f.id=p_form_id and f.published_version_id is not null and f.status in ('published','closed') and w.status='active';
$$;
revoke all on function platform.operator_users(text,uuid[],integer,integer),platform.operator_user_counts(),platform.operator_outbox_summary(),platform.moderate_workspace(uuid,workspace_status,text),platform.moderate_form(uuid,boolean,text),platform.set_override(uuid,text,text,timestamptz) from public;
grant execute on function platform.operator_users(text,uuid[],integer,integer),platform.operator_user_counts(),platform.operator_outbox_summary(),platform.moderate_workspace(uuid,workspace_status,text),platform.moderate_form(uuid,boolean,text),platform.set_override(uuid,text,text,timestamptz) to soyl_app;
