create function platform.start_visit(p_form uuid,p_version uuid,p_session text,p_source text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if length(p_session) not between 1 and 100 or not exists(select 1 from forms f join workspaces w on w.id=f.workspace_id
    join form_versions v on v.form_id=f.id where f.id=p_form and v.id=p_version and f.status='published' and w.status='active') then
    raise exception 'Form unavailable';
  end if;
  insert into form_visits(form_id,form_version_id,session_id,source) values(p_form,p_version,p_session,left(p_source,20))
    on conflict(form_id,session_id) do nothing;
end $$;
create function platform.record_progress(p_form uuid,p_version uuid,p_session text,p_block text) returns void
language plpgsql security definer set search_path=pg_catalog,public,platform_private as $$
begin
  if exists(select 1 from form_visits v join forms f on f.id=v.form_id join workspaces w on w.id=f.workspace_id
    where v.form_id=p_form and v.form_version_id=p_version and v.session_id=p_session and f.status='published' and w.status='active') then
    perform platform_private.record_form_progress(p_form,p_session,p_block);
  end if;
end $$;
create function platform.save_progress(p_form uuid,p_version uuid,p_session text,p_token text,p_answers jsonb,p_key text,p_current text,p_history text[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,platform_private as $$
begin
  if not exists(select 1 from forms f join workspaces w on w.id=f.workspace_id join form_versions v on v.form_id=f.id
    where f.id=p_form and v.id=p_version and f.status='published' and w.status='active') then return null; end if;
  return platform_private.save_partial_response(p_form,p_version,p_session,p_token,p_answers,p_key,p_current,p_history);
end $$;
create function platform.load_progress(p_form uuid,p_token text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('answers',p.answers,'current_block_id',p.current_block_id,'history',p.history,
    'session_id',p.session_id,'idempotency_key',p.idempotency_key,'form_version_id',p.form_version_id,'updated_at',p.updated_at)
  from partial_responses p join forms f on f.id=p.form_id join workspaces w on w.id=f.workspace_id
  where p.form_id=p_form and p.token=p_token and p_token ~ '^[a-f0-9]{32}$' and p.updated_at>statement_timestamp()-interval '30 days'
    and f.status='published' and w.status='active'
    and not exists(select 1 from submissions s where s.form_id=p.form_id and s.idempotency_key=p.idempotency_key);
$$;
create function platform.submission_file_metadata(p_form uuid,p_workspace uuid,p_question text,p_file uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',u.id,'size_bytes',u.size_bytes,'mime_type',u.mime_type,'verified_at',u.verified_at)
  from uploaded_files u join forms f on f.id=u.form_id join workspaces w on w.id=f.workspace_id
  where u.id=p_file and u.form_id=p_form and u.workspace_id=p_workspace and u.question_id=p_question
    and u.kind='submission' and u.status='pending' and u.submission_id is null and u.verified_at is not null
    and f.status='published' and w.status='active';
$$;
revoke all on function platform.start_visit(uuid,uuid,text,text),platform.record_progress(uuid,uuid,text,text),
  platform.save_progress(uuid,uuid,text,text,jsonb,text,text,text[]),platform.load_progress(uuid,text),
  platform.submission_file_metadata(uuid,uuid,text,uuid) from public;
grant execute on function platform.start_visit(uuid,uuid,text,text),platform.record_progress(uuid,uuid,text,text),
  platform.save_progress(uuid,uuid,text,text,jsonb,text,text,text[]),platform.load_progress(uuid,text),
  platform.submission_file_metadata(uuid,uuid,text,uuid) to soyl_app;
