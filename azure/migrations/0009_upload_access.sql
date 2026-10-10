-- All object storage stays private. Respondent access requires an unguessable
-- upload capability; creator operations require the current workspace role.
create function platform.reserve_file(p_file jsonb,p_storage_limit bigint,p_version uuid default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
declare v_workspace uuid:=(p_file->>'workspace_id')::uuid; v_form uuid:=(p_file->>'form_id')::uuid;
begin
  if p_file->>'kind'='submission' then
    if not exists(select 1 from forms f join workspaces w on w.id=f.workspace_id
      join form_versions v on v.form_id=f.id and v.id=p_version
      where f.id=v_form and f.workspace_id=v_workspace and f.status='published' and w.status='active'
      and exists(select 1 from jsonb_array_elements(v.schema->'blocks') b where b->>'id'=p_file->>'question_id' and b->>'type'='file_upload'))
      or coalesce(p_file->>'upload_token_hash','') !~ '^[a-f0-9]{64}$' then return false; end if;
  else
    if p_file->>'kind' not in ('brand_asset','brand_source','question_media') or not platform.can_access(v_workspace,'editor') then return false; end if;
    if v_form is not null and not exists(select 1 from forms where id=v_form and workspace_id=v_workspace) then return false; end if;
    if p_file->>'brand_kit_id' is not null and not exists(select 1 from brand_kits where id=(p_file->>'brand_kit_id')::uuid and workspace_id=v_workspace) then return false; end if;
  end if;
  if (p_file->>'size_bytes')::bigint not between 1 and 104857600 then return false; end if;
  return platform_private.reserve_upload(p_file,p_storage_limit);
end $$;

create function platform.read_upload(p_id uuid,p_form uuid default null,p_token_hash text default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select to_jsonb(u) from uploaded_files u join workspaces w on w.id=u.workspace_id
  where u.id=p_id and w.status='active' and u.status<>'deleted' and (
    (p_token_hash is null and platform.can_access(u.workspace_id)) or
    (u.kind='submission' and u.form_id=p_form and u.upload_token_hash=p_token_hash and p_token_hash ~ '^[a-f0-9]{64}$'));
$$;

create function platform.finalize_file(p_id uuid,p_original_key text,p_frozen_key text,p_token_hash text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_file uploaded_files%rowtype;
begin
  select * into v_file from uploaded_files where id=p_id;
  if not found then return false; end if;
  -- Use the same lock order as submission and expiry to avoid attachment races.
  perform 1 from workspaces where id=v_file.workspace_id and status='active' for update;
  if not found then return false; end if;
  select * into v_file from uploaded_files where id=p_id for update;
  if v_file.status not in ('pending','attached') or v_file.verified_at is not null or v_file.r2_key<>p_original_key then return false; end if;
  if v_file.kind='submission' then
    if p_token_hash is null or v_file.upload_token_hash is distinct from p_token_hash then return false; end if;
  elsif not platform.can_access(v_file.workspace_id,'editor') then return false;
  end if;
  if p_frozen_key is null or p_frozen_key=p_original_key then return false; end if;
  update uploaded_files set r2_key=p_frozen_key,verified_at=clock_timestamp(),
    status=case when kind='submission' then status else 'attached' end where id=p_id;
  return true;
end $$;

create function platform.public_asset(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('r2_key',u.r2_key,'status',u.status,'kind',u.kind,'mime_type',u.mime_type)
  from uploaded_files u join workspaces w on w.id=u.workspace_id
  where u.id=p_id and w.status='active' and u.status='attached' and u.verified_at is not null
    and u.kind in ('brand_asset','question_media') and u.mime_type like 'image/%';
$$;
revoke all on function platform.reserve_file(jsonb,bigint,uuid),platform.read_upload(uuid,uuid,text),platform.finalize_file(uuid,text,text,text),platform.public_asset(uuid) from public;
grant execute on function platform.reserve_file(jsonb,bigint,uuid),platform.read_upload(uuid,uuid,text),platform.finalize_file(uuid,text,text,text),platform.public_asset(uuid) to soyl_app;
