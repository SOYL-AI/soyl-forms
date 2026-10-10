create function platform.moderate_form_checked(p_form uuid,p_suspend boolean,p_reason text,p_max integer) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_workspace uuid;v_status form_status;v_version uuid;
begin
  if platform.admin_role() is null then raise exception 'Not an operator' using errcode='42501'; end if;
  select workspace_id into v_workspace from forms where id=p_form;
  perform 1 from workspaces where id=v_workspace for update;
  select status,published_version_id into v_status,v_version from forms where id=p_form for update;
  if not found then return false; end if;
  if p_max not between 0 and 100000 then raise exception 'Invalid form limit'; end if;
  if not p_suspend and v_version is not null and v_status<>'published'
    and (select count(*) from forms where workspace_id=v_workspace and status='published')>=p_max then raise exception 'Active form limit reached'; end if;
  return platform.moderate_form(p_form,p_suspend,p_reason);
end $$;
revoke execute on function platform.moderate_form(uuid,boolean,text) from soyl_app;
revoke all on function platform.moderate_form_checked(uuid,boolean,text,integer) from public;
grant execute on function platform.moderate_form_checked(uuid,boolean,text,integer) to soyl_app;
