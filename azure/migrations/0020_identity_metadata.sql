-- The OIDC subject is not a directory object ID. Store only the signed oid claim.
alter table identity.provider_identities add column object_id uuid;
alter table public.app_users add column last_sign_in_at timestamptz;
create function identity.resolve_verified_user(p_issuer text,p_subject text,p_email text,p_verified boolean,p_name text,p_object_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,identity as $$
declare v_id uuid;v_object uuid;
begin
  v_id:=identity.resolve_user(p_issuer,p_subject,p_email,p_verified,p_name);
  select object_id into v_object from identity.provider_identities where issuer=p_issuer and subject=p_subject;
  if v_object is not null and p_object_id is distinct from v_object then raise exception 'Provider identity changed'; end if;
  update identity.provider_identities set object_id=coalesce(object_id,p_object_id) where issuer=p_issuer and subject=p_subject;
  update app_users set last_sign_in_at=clock_timestamp() where id=v_id;
  return v_id;
end $$;
revoke all on function identity.resolve_verified_user(text,text,text,boolean,text,uuid) from public;
grant execute on function identity.resolve_verified_user(text,text,text,boolean,text,uuid) to soyl_auth;
