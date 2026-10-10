create function platform.spend_credits(p_workspace uuid,p_amount bigint,p_reason text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
begin
  if not platform.can_access(p_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount not between 1 and 100000 or length(p_reason) not between 1 and 200 then raise exception 'Invalid credit operation'; end if;
  return platform_private.spend_ai_credits(p_workspace,p_amount,p_reason);
end $$;
create function platform.refund_credits(p_workspace uuid,p_amount bigint,p_ref text) returns bigint
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
begin
  if not platform.can_access(p_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount not between 1 and 100000 or length(p_ref) not between 1 and 200 then raise exception 'Invalid refund'; end if;
  return platform_private.grant_ai_credits(p_workspace,p_amount,'refund',p_ref);
end $$;
revoke all on function platform.spend_credits(uuid,bigint,text),platform.refund_credits(uuid,bigint,text) from public;
grant execute on function platform.spend_credits(uuid,bigint,text),platform.refund_credits(uuid,bigint,text) to soyl_app;
