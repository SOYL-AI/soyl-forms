create function platform.read_team(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,platform as $$
declare v_role member_role:=platform.workspace_role(p_workspace); v_members jsonb; v_invites jsonb;
begin
  if v_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,'displayName',p.display_name,
    'role',m.role,'isSelf',m.user_id=platform.actor_id()) order by m.created_at,m.user_id),'[]') into v_members
    from workspace_members m join app_users u on u.id=m.user_id left join profiles p on p.id=m.user_id where m.workspace_id=p_workspace;
  if v_role in ('owner','admin') then
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expiresAt',i.expires_at) order by i.created_at desc),'[]')
      into v_invites from workspace_invites i where i.workspace_id=p_workspace and i.accepted_at is null and i.expires_at>now();
  end if;
  return jsonb_build_object('members',v_members,'invites',coalesce(v_invites,'[]'),'myRole',v_role);
end $$;

create function platform.create_invite(p_workspace uuid,p_email text,p_role member_role,p_limit integer) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_role member_role; v_id uuid;
begin
  perform 1 from workspaces where id=p_workspace for update;
  v_role:=platform.workspace_role(p_workspace);
  if v_role not in ('owner','admin') or v_role is null or (v_role='admin' and p_role in ('owner','admin')) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_email<>lower(trim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>200 or p_limit not between 1 and 100 then raise exception 'Invalid invite'; end if;
  if (select count(*) from workspace_members where workspace_id=p_workspace)>=p_limit then raise exception 'Team member limit reached'; end if;
  -- Rotate the actual URL capability on reinvite. The old implementation rotated
  -- an unused token while leaving the URL valid indefinitely.
  insert into workspace_invites(workspace_id,email,role,token,invited_by,expires_at)
    values(p_workspace,p_email,p_role,replace(gen_random_uuid()::text,'-',''),platform.actor_id(),now()+interval '7 days')
    on conflict(workspace_id,email) do update set id=gen_random_uuid(),role=excluded.role,token=excluded.token,
      invited_by=excluded.invited_by,expires_at=excluded.expires_at,accepted_at=null,created_at=now() returning id into v_id;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id)
    values(platform.actor_id(),'user',p_workspace,'team.invited','invite',v_id::text);
  return v_id;
end $$;

create function platform.read_invite(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expires_at',i.expires_at,'accepted_at',i.accepted_at)
  from workspace_invites i join workspaces w on w.id=i.workspace_id
  where i.id=p_id and w.status='active' and platform.actor_id() is not null;
$$;
create function platform.revoke_invite(p_workspace uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  perform 1 from workspaces where id=p_workspace for update;
  if not platform.can_access(p_workspace,'admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  delete from workspace_invites where id=p_id and workspace_id=p_workspace;
  return found;
end $$;

create function platform.accept_invite(p_id uuid,p_limit integer) returns uuid
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

create function platform.change_member(p_workspace uuid,p_target uuid,p_role member_role default null,p_leave boolean default false) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_actor uuid:=platform.actor_id(); v_actor_role member_role; v_target_role member_role;
begin
  perform 1 from workspaces where id=p_workspace for update;
  v_actor_role:=platform.workspace_role(p_workspace);
  select role into v_target_role from workspace_members where workspace_id=p_workspace and user_id=p_target;
  if v_actor_role is null or v_target_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_leave then
    if p_target<>v_actor or p_role is not null then raise exception 'Invalid leave request' using errcode='42501'; end if;
  elsif v_actor=p_target or v_actor_role not in ('owner','admin') or (v_actor_role='admin' and (v_target_role in ('owner','admin') or p_role in ('owner','admin'))) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if v_target_role='owner' and p_role is distinct from 'owner'::member_role
    and (select count(*) from workspace_members where workspace_id=p_workspace and role='owner')<=1 then raise exception 'Promote another owner first'; end if;
  if p_role is null then delete from workspace_members where workspace_id=p_workspace and user_id=p_target;
  else update workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_target; end if;
  if p_role is distinct from 'owner'::member_role then
    update workspaces set owner_user_id=(select user_id from workspace_members where workspace_id=p_workspace and role='owner' order by created_at,user_id limit 1)
      where id=p_workspace and owner_user_id=p_target;
  end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(v_actor,'user',p_workspace,case when p_role is null then 'team.removed' else 'team.role_changed' end,'user',p_target::text,jsonb_build_object('role',p_role));
  return true;
end $$;
revoke all on function platform.read_team(uuid),platform.create_invite(uuid,text,member_role,integer),platform.read_invite(uuid),platform.revoke_invite(uuid,uuid),platform.accept_invite(uuid,integer),platform.change_member(uuid,uuid,member_role,boolean) from public;
grant execute on function platform.read_team(uuid),platform.create_invite(uuid,text,member_role,integer),platform.read_invite(uuid),platform.revoke_invite(uuid,uuid),platform.accept_invite(uuid,integer),platform.change_member(uuid,uuid,member_role,boolean) to soyl_app;
