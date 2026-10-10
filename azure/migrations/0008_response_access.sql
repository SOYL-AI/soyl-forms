create function platform.form_analytics(p_form_id uuid,p_question_ids text[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,platform,platform_private as $$
begin
  if not exists(select 1 from forms f where f.id=p_form_id and platform.can_access(f.workspace_id)) then raise exception 'Not authorized' using errcode='42501'; end if;
  return platform_private.form_analytics(p_form_id,p_question_ids);
end $$;
create function platform.search_responses(p_form_id uuid,p_query text,p_tag text,p_from timestamptz,p_to timestamptz,p_offset integer,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,platform,platform_private as $$
begin
  if not exists(select 1 from forms f where f.id=p_form_id and platform.can_access(f.workspace_id)) then raise exception 'Not authorized' using errcode='42501'; end if;
  return platform_private.search_form_responses(p_form_id,left(p_query,200),left(p_tag,30),p_from,p_to,p_offset,p_limit);
end $$;
create function platform.audit_response_edit(p_submission uuid,p_action text,p_metadata jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from submissions where id=p_submission;
  if not platform.can_access(v_workspace,'editor') or p_action not in ('submission.edited','submission.tagged') then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into audit_logs(actor_user_id,actor_type,workspace_id,action,target_type,target_id,metadata)
    values(platform.actor_id(),'user',v_workspace,p_action,'submission',p_submission::text,p_metadata);
end $$;
revoke all on function platform.form_analytics(uuid,text[]),platform.search_responses(uuid,text,text,timestamptz,timestamptz,integer,integer),platform.audit_response_edit(uuid,text,jsonb) from public;
grant execute on function platform.form_analytics(uuid,text[]),platform.search_responses(uuid,text,text,timestamptz,timestamptz,integer,integer),platform.audit_response_edit(uuid,text,jsonb) to soyl_app;
