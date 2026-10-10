create or replace function platform.publish_form(p_form_id uuid,p_schema jsonb,p_theme jsonb,p_settings jsonb,p_max_active integer)
returns table(version_id uuid,version_number integer)
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
declare v_workspace uuid; v_status public.form_status;
begin
  select workspace_id into v_workspace from forms where id=p_form_id;
  if v_workspace is null or not platform.can_access(v_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from workspaces where id=v_workspace for update;
  select status into v_status from forms where id=p_form_id and workspace_id=v_workspace for update;
  if p_max_active is null or p_max_active<1 then raise exception 'Invalid form limit'; end if;
  if v_status<>'published' and (select count(*) from forms where workspace_id=v_workspace and status='published' and id<>p_form_id)>=p_max_active then
    raise exception 'Active form limit reached';
  end if;
  return query select * from platform_private.publish_form(p_form_id,p_schema,p_theme,p_settings,platform.actor_id());
end $$;
create function platform.reopen_form(p_form_id uuid,p_max_active integer) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_workspace uuid; v_status public.form_status; v_version uuid;
begin
  select workspace_id into v_workspace from forms where id=p_form_id;
  if v_workspace is null or not platform.can_access(v_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from workspaces where id=v_workspace for update;
  select status,published_version_id into v_status,v_version from forms where id=p_form_id for update;
  if v_version is null or not exists(select 1 from form_versions where id=v_version and form_id=p_form_id) then return false; end if;
  if p_max_active is null or p_max_active<1 then return false; end if;
  if v_status<>'published' and (select count(*) from forms where workspace_id=v_workspace and status='published' and id<>p_form_id)>=p_max_active then return false; end if;
  update forms set status='published',updated_at=clock_timestamp() where id=p_form_id;
  return true;
end $$;

revoke insert,update,delete on brand_kits from soyl_app;
create function platform.save_brand_kit(p_workspace uuid,p_id uuid,p_input jsonb,p_max integer) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_id uuid:=p_id; v_logo uuid:=nullif(p_input->>'logo_file_id','')::uuid;
begin
  if not platform.can_access(p_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from workspaces where id=p_workspace for update;
  if v_logo is not null and not exists(select 1 from uploaded_files where id=v_logo and workspace_id=p_workspace and kind='brand_asset' and status='attached' and verified_at is not null) then raise exception 'Logo unavailable'; end if;
  if p_id is null then
    if p_max is null or p_max<1 or (select count(*) from brand_kits where workspace_id=p_workspace)>=p_max then raise exception 'Brand kit limit reached'; end if;
    v_id:=gen_random_uuid();
  elsif not exists(select 1 from brand_kits where id=p_id and workspace_id=p_workspace) then raise exception 'Brand kit unavailable'; end if;
  if coalesce((p_input->>'is_default')::boolean,false) then update brand_kits set is_default=false where workspace_id=p_workspace; end if;
  insert into brand_kits(id,workspace_id,name,is_default,logo_url,logo_file_id,colors,fonts,voice,style,summary,sources,created_by)
    values(v_id,p_workspace,p_input->>'name',coalesce((p_input->>'is_default')::boolean,false),p_input->>'logo_url',v_logo,
      p_input->'colors',p_input->'fonts',p_input->'voice',p_input->'style',coalesce(p_input->>'summary',''),p_input->'sources',platform.actor_id())
    on conflict(id) do update set name=excluded.name,is_default=excluded.is_default,logo_url=excluded.logo_url,logo_file_id=excluded.logo_file_id,
      colors=excluded.colors,fonts=excluded.fonts,voice=excluded.voice,style=excluded.style,summary=excluded.summary,sources=excluded.sources,updated_at=clock_timestamp();
  return v_id;
end $$;
create function platform.default_brand_kit(p_workspace uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if not platform.can_access(p_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from workspaces where id=p_workspace for update;
  if not exists(select 1 from brand_kits where id=p_id and workspace_id=p_workspace) then return false; end if;
  update brand_kits set is_default=false where workspace_id=p_workspace;
  update brand_kits set is_default=true,updated_at=clock_timestamp() where id=p_id and workspace_id=p_workspace;
  return true;
end $$;
create function platform.delete_brand_kit(p_workspace uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if not platform.can_access(p_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from workspaces where id=p_workspace for update;
  delete from brand_kits where id=p_id and workspace_id=p_workspace;
  return found;
end $$;
revoke all on function platform.reopen_form(uuid,integer),platform.save_brand_kit(uuid,uuid,jsonb,integer),platform.default_brand_kit(uuid,uuid),platform.delete_brand_kit(uuid,uuid) from public;
grant execute on function platform.reopen_form(uuid,integer),platform.save_brand_kit(uuid,uuid,jsonb,integer),platform.default_brand_kit(uuid,uuid),platform.delete_brand_kit(uuid,uuid) to soyl_app;
