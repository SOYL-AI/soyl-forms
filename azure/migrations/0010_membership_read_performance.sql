-- Compute the current actor's workspace set once per statement, instead of
-- invoking a SECURITY DEFINER membership lookup for every response/file row.
create function platform.readable_workspaces() returns setof uuid
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select m.workspace_id from workspace_members m join workspaces w on w.id=m.workspace_id
  where m.user_id=platform.actor_id() and w.status='active';
$$;
revoke all on function platform.readable_workspaces() from public;
grant execute on function platform.readable_workspaces() to soyl_app;
alter policy workspace_read on workspaces using(id in(select platform.readable_workspaces()));
alter policy membership_read on workspace_members using(user_id=(select platform.actor_id()) or workspace_id in(select platform.readable_workspaces()));
alter policy forms_read on forms using(workspace_id in(select platform.readable_workspaces()));
alter policy submissions_read on submissions using(workspace_id in(select platform.readable_workspaces()));
alter policy uploads_read on uploaded_files using(workspace_id in(select platform.readable_workspaces()));
alter policy subscriptions_read on subscriptions using(workspace_id in(select platform.readable_workspaces()));
alter policy usage_read on usage_monthly using(workspace_id in(select platform.readable_workspaces()));
alter policy credits_read on ai_credits using(workspace_id in(select platform.readable_workspaces()));
alter policy credit_ledger_read on ai_credit_ledger using(workspace_id in(select platform.readable_workspaces()));
alter policy brand_read on brand_kits using(workspace_id in(select platform.readable_workspaces()));
