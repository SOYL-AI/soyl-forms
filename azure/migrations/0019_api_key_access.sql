-- API credentials carry their creator's current permissions, never an unrestricted service role.
create function platform.verify_api_key(p_hash text)
returns table(workspace_id uuid,key_id uuid,key_prefix text,user_id uuid)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k workspace_api_keys%rowtype;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select a.* into k from workspace_api_keys a
    join workspaces w on w.id=a.workspace_id and w.status='active'
    join app_users u on u.id=a.created_by and u.status='active'
    join workspace_members m on m.workspace_id=a.workspace_id and m.user_id=a.created_by
    where a.key_hash=p_hash and a.revoked_at is null and m.role in ('owner','admin','editor');
  if not found then return; end if;
  update workspace_api_keys a set last_used_at=clock_timestamp() where a.id=k.id;
  return query select k.workspace_id,k.id,k.key_prefix,k.created_by;
end;
$$;
revoke all on function platform.verify_api_key(text) from public;
grant execute on function platform.verify_api_key(text) to soyl_app;
