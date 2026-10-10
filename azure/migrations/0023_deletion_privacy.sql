-- Scrub account audit payloads and prevent operator reactivation during deletion.
create or replace function platform.finish_account_deletion(p_id uuid,p_lease uuid) returns boolean
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
  delete from audit_logs where workspace_id=any(r.workspace_ids);
  update audit_logs set metadata='{}' where actor_user_id=r.user_id;
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
create or replace function platform.moderate_workspace(p_workspace uuid,p_status workspace_status,p_reason text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  if exists(select 1 from identity.deletion_requests where p_workspace=any(workspace_ids)) then raise exception 'Account deletion pending'; end if;
  update workspaces set status=p_status,updated_at=now() where id=p_workspace;
  if not found then return false; end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(platform.actor_id(),'admin',p_workspace,case when p_status='active' then 'workspace.reactivate' else 'workspace.suspend' end,'workspace',p_workspace::text,jsonb_build_object('reason',left(p_reason,300)));
  return true;
end $$;
