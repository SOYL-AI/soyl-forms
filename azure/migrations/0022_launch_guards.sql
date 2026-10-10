-- Preserve creator work when accepting an invite, and persistent login history for operators.
create or replace function platform.accept_invite(p_id uuid,p_limit integer) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_actor uuid:=platform.actor_id(); v_invite workspace_invites%rowtype; v_old uuid; v_email text;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:'||v_actor,0));
  select * into v_invite from workspace_invites where id=p_id;
  if not found then raise exception 'Invite unavailable'; end if;
  -- Lock all relevant workspaces in UUID order before invite/member rows.
  perform 1 from workspaces where id=v_invite.workspace_id or id in(select workspace_id from workspace_members where user_id=v_actor) order by id for update;
  select * into v_invite from workspace_invites where id=p_id for update;
  if not found or v_invite.accepted_at is not null or v_invite.expires_at<=now() or not exists(select 1 from workspaces where id=v_invite.workspace_id and status='active') then raise exception 'Invite expired or already used'; end if;
  select lower(email) into v_email from app_users where id=v_actor;
  -- The emailed, unguessable URL proves possession of the invitation. A signed
  -- provider email claim must also match; email alone never links identities.
  if v_email is null or v_email<>v_invite.email then raise exception 'Sign in using the invited email address'; end if;
  if exists(select 1 from workspace_members where workspace_id=v_invite.workspace_id and user_id=v_actor) then
    update workspace_invites set accepted_at=now() where id=p_id; return v_invite.workspace_id;
  end if;
  if (select count(*) from workspace_members where user_id=v_actor)>1 then raise exception 'Leave existing workspaces first'; end if;
  select workspace_id into v_old from workspace_members where user_id=v_actor;
  if v_old is not null then
    if not exists(select 1 from workspaces where id=v_old and owner_user_id=v_actor)
      or (select count(*) from workspace_members where workspace_id=v_old)<>1
      or exists(select 1 from forms where workspace_id=v_old)
      or exists(select 1 from uploaded_files where workspace_id=v_old)
      or exists(select 1 from brand_kits where workspace_id=v_old)
      or exists(select 1 from workspace_api_keys where workspace_id=v_old)
      or exists(select 1 from workspace_invites where workspace_id=v_old)
      or exists(select 1 from ai_credit_ledger where workspace_id=v_old and reason<>'welcome')
      or exists(select 1 from workspace_payment_providers where workspace_id=v_old)
      or exists(select 1 from subscriptions where workspace_id=v_old and (status<>'free' or plan_code<>'free' or provider_subscription_id is not null))
      then raise exception 'Leave the existing workspace first'; end if;
    -- Delete only an untouched auto-provisioned personal workspace.
    delete from workspaces where id=v_old;
  end if;
  if p_limit not between 1 and 100 or (select count(*) from workspace_members where workspace_id=v_invite.workspace_id)>=p_limit then raise exception 'Team member limit reached'; end if;
  insert into workspace_members(workspace_id,user_id,role) values(v_invite.workspace_id,v_actor,v_invite.role);
  update workspace_invites set accepted_at=now() where id=p_id;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id)
    values(v_actor,'user',v_invite.workspace_id,'team.joined','user',v_actor::text);
  return v_invite.workspace_id;
end $$;

create or replace function platform.operator_users(p_query text default '',p_ids uuid[] default null,p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,email text,email_verified boolean,created_at timestamptz,last_sign_in_at timestamptz,status text,identities jsonb)
language plpgsql stable security definer set search_path=pg_catalog,public,identity,platform as $$
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  return query select u.id,u.email,u.email_verified,u.created_at,
    coalesce(u.last_sign_in_at,(select max(s.created_at) from identity.sessions s where s.user_id=u.id)),u.status,
    case when exists(select 1 from identity.provider_identities p where p.user_id=u.id) then '[{"provider":"Entra External ID"}]'::jsonb else '[]'::jsonb end
    from app_users u where (p_ids is null or u.id=any(p_ids))
    and (coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')),lower(p_query))>0 or strpos(u.id::text,lower(p_query))>0)
    order by u.created_at desc,u.id limit least(greatest(p_limit,1),100) offset least(greatest(p_offset,0),1000000);
end $$;

create function platform.schema_version() returns text
language sql stable security definer set search_path=pg_catalog,platform_migrations as $$
  select max(name) from platform_migrations.history;
$$;
revoke all on function platform.schema_version() from public;
grant execute on function platform.schema_version() to soyl_app;
