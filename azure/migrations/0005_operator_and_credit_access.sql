create function platform.admin_role() returns public.admin_role
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select role from admin_users where user_id=platform.actor_id();
$$;
create function platform.set_flags(p_flags jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if platform.admin_role() is distinct from 'super_admin'::public.admin_role then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into platform_settings(key,value,updated_by) values('flags',p_flags,platform.actor_id())
    on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  insert into audit_logs(actor_user_id,actor_type,action,target_type,target_id) values(platform.actor_id(),'admin','platform.flags.update','platform','flags');
end $$;
create function platform.grant_monthly_credits(p_workspace_id uuid,p_amount integer,p_plan text) returns bigint
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
begin
  if not platform.can_access(p_workspace_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount not between 0 and 100000 or p_plan not in ('free','starter','pro') then raise exception 'Invalid credit allocation'; end if;
  return platform_private.grant_ai_credits(p_workspace_id,p_amount,'monthly',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')||':'||p_plan);
end $$;
revoke all on function platform.admin_role(),platform.set_flags(jsonb),platform.grant_monthly_credits(uuid,integer,text) from public;
grant execute on function platform.admin_role(),platform.set_flags(jsonb),platform.grant_monthly_credits(uuid,integer,text) to soyl_app;
