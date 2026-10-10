-- Durable deletion survives provider failures and application restarts. No runtime table grants.
create table identity.deletion_requests (
  id uuid primary key default gen_random_uuid(),user_id uuid not null unique,
  providers jsonb not null,workspace_ids uuid[] not null,subscriptions jsonb not null,
  billing_done boolean not null default false,provider_done boolean not null default false,
  requested_at timestamptz not null default now(),available_at timestamptz not null default now()+interval '1 minute',
  lease_token uuid,lease_until timestamptz,attempts integer not null default 0
);
create table identity.deletion_objects (
  request_id uuid not null references identity.deletion_requests(id) on delete cascade,
  r2_key text not null,done boolean not null default false,primary key(request_id,r2_key)
);
revoke all on identity.deletion_requests,identity.deletion_objects from public;

create function platform.request_account_deletion() returns uuid
language plpgsql security definer set search_path=pg_catalog,public,platform,identity as $$
declare v_user uuid:=platform.actor_id();v_id uuid;v_spaces uuid[];v_providers jsonb;v_subs jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  perform 1 from app_users where id=v_user and status='active' for update;
  if not found then raise exception 'Sign in required' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object('issuer',issuer,'objectId',object_id)) into v_providers
    from identity.provider_identities where user_id=v_user;
  if v_providers is null or exists(select 1 from identity.provider_identities where user_id=v_user and object_id is null)
    then raise exception 'Sign out and sign in again before deleting your account'; end if;
  select coalesce(array_agg(id order by id),'{}') into v_spaces from workspaces where owner_user_id=v_user;
  perform 1 from workspaces where id=any(v_spaces) order by id for update;
  select coalesce(jsonb_agg(provider_subscription_id),'[]') into v_subs from subscriptions
    where workspace_id=any(v_spaces) and provider_subscription_id is not null;
  insert into identity.deletion_requests(user_id,providers,workspace_ids,subscriptions)
    values(v_user,v_providers,v_spaces,v_subs) returning id into v_id;
  insert into identity.deletion_objects(request_id,r2_key) select distinct v_id,r2_key from uploaded_files where workspace_id=any(v_spaces);
  update app_users set status='disabled',updated_at=clock_timestamp() where id=v_user;
  update workspaces set status='suspended' where id=any(v_spaces);
  update workspace_api_keys set revoked_at=now() where created_by=v_user;
  delete from identity.sessions where user_id=v_user;
  delete from identity.native_handoffs where user_id=v_user;
  insert into audit_logs(actor_type,action,target_type,target_id) values('user','account.deletion_requested','user',v_user);
  return v_id;
end $$;

create function platform.claim_account_deletion() returns jsonb
language plpgsql security definer set search_path=pg_catalog,identity as $$
declare r identity.deletion_requests%rowtype;v_objects jsonb;
begin
  select * into r from identity.deletion_requests where available_at<=now()
    and (lease_until is null or lease_until<=now()) order by requested_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update identity.deletion_requests set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1
    where id=r.id returning * into r;
  select coalesce(jsonb_agg(r2_key),'[]') into v_objects from (select r2_key from identity.deletion_objects where request_id=r.id and not done order by r2_key limit 100) x;
  return to_jsonb(r)||jsonb_build_object('objects',v_objects);
end $$;

create function platform.checkpoint_account_deletion(p_id uuid,p_lease uuid,p_stage text,p_key text default null) returns boolean
language plpgsql security definer set search_path=pg_catalog,identity as $$
begin
  perform 1 from identity.deletion_requests where id=p_id and lease_token=p_lease and lease_until>now() for update;
  if not found then return false; end if;
  if p_stage='object' then update identity.deletion_objects set done=true where request_id=p_id and r2_key=p_key;
  elsif p_stage='billing' then update identity.deletion_requests set billing_done=true where id=p_id;
  elsif p_stage='provider' then update identity.deletion_requests set provider_done=true where id=p_id;
  else raise exception 'Invalid deletion stage'; end if;
  return true;
end $$;

create function platform.finish_account_deletion(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,identity as $$
declare r identity.deletion_requests%rowtype;
begin
  select * into r from identity.deletion_requests where id=p_id and lease_token=p_lease and lease_until>now() for update;
  if not found then return false; end if;
  if not r.billing_done or not r.provider_done then return false; end if;
  perform 1 from workspaces where id=any(r.workspace_ids) order by id for update;
  -- Catch an upload that was already in flight when the account was disabled.
  insert into identity.deletion_objects(request_id,r2_key) select distinct r.id,f.r2_key from uploaded_files f
    where f.workspace_id=any(r.workspace_ids) and f.status<>'deleted' on conflict do nothing;
  if exists(select 1 from identity.deletion_objects where request_id=r.id and not done) then return false; end if;
  delete from workspaces where id=any(r.workspace_ids) and owner_user_id=r.user_id;
  update forms set created_by=null where created_by=r.user_id;
  update form_versions set published_by=null where published_by=r.user_id;
  update brand_kits set created_by=null where created_by=r.user_id;
  update admin_users set created_by=null where created_by=r.user_id;
  update platform_settings set updated_by=null where updated_by=r.user_id;
  delete from workspace_api_keys where created_by=r.user_id;
  delete from identity.sessions where user_id=r.user_id;
  delete from identity.native_handoffs where user_id=r.user_id;
  delete from identity.provider_identities where user_id=r.user_id;
  delete from app_users where id=r.user_id and status='disabled';
  insert into audit_logs(actor_type,action,target_type,target_id) values('system','account.deleted','user',r.user_id);
  delete from identity.deletion_requests where id=r.id;
  return true;
end $$;
revoke all on function platform.request_account_deletion(),platform.claim_account_deletion(),platform.checkpoint_account_deletion(uuid,uuid,text,text),platform.finish_account_deletion(uuid,uuid) from public;
grant execute on function platform.request_account_deletion(),platform.claim_account_deletion(),platform.checkpoint_account_deletion(uuid,uuid,text,text),platform.finish_account_deletion(uuid,uuid) to soyl_app;
