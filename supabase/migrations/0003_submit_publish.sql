-- 0003_submit_publish: atomic publish + submission RPCs (Phase 3).
--
-- Called ONLY with the service role after application-layer authorization.
-- These run SECURITY DEFINER (bypassing RLS by design), so EXECUTE is
-- revoked from anon/authenticated/public and granted to service_role only.

-- Publish: lock the form, append an immutable version, move the pointer -----
create or replace function publish_form(
  p_form_id uuid,
  p_schema jsonb,
  p_theme jsonb,
  p_settings jsonb,
  p_published_by uuid
)
returns table (version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
  v_id uuid;
begin
  perform 1 from forms where id = p_form_id for update;
  if not found then
    raise exception 'FORM_NOT_FOUND';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_num
  from form_versions
  where form_id = p_form_id;

  insert into form_versions (form_id, version_number, schema, theme, settings, published_by)
  values (p_form_id, v_num, p_schema, p_theme, p_settings, p_published_by)
  returning id into v_id;

  update forms
  set published_version_id = v_id,
      status = 'published',
      published_at = now(),
      updated_at = now()
  where id = p_form_id;

  return query select v_id, v_num;
end;
$$;

-- Submit: idempotent insert + atomic monthly-limit gate in one transaction ----
create or replace function submit_form(
  p_form_id uuid,
  p_workspace_id uuid,
  p_version_id uuid,
  p_idempotency_key text,
  p_answers jsonb,
  p_hidden jsonb,
  p_source text,
  p_duration_ms bigint,
  p_monthly_limit bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := (date_trunc('month', now()))::date;
  v_count bigint;
  v_id uuid;
  v_existing uuid;
begin
  -- Retry with the same key returns the original submission, never a duplicate.
  select id into v_existing
  from submissions
  where form_id = p_form_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'submission_id', v_existing);
  end if;

  -- Monthly-limit gate: row lock serializes concurrent submissions.
  insert into usage_monthly (workspace_id, month, completed_submissions)
  values (p_workspace_id, v_month, 0)
  on conflict (workspace_id, month) do nothing;

  select completed_submissions into v_count
  from usage_monthly
  where workspace_id = p_workspace_id and month = v_month
  for update;

  if v_count >= p_monthly_limit then
    return jsonb_build_object('ok', false, 'error', 'LIMIT_REACHED');
  end if;

  insert into submissions (
    workspace_id, form_id, form_version_id, idempotency_key,
    answers, hidden_fields, source, status, duration_ms
  )
  values (
    p_workspace_id, p_form_id, p_version_id, p_idempotency_key,
    p_answers, p_hidden, p_source, 'completed', p_duration_ms
  )
  on conflict (form_id, idempotency_key) do nothing
  returning id into v_id;

  -- Lost the race with an identical retry: return the winner's id.
  if v_id is null then
    select id into v_existing
    from submissions
    where form_id = p_form_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('ok', true, 'duplicate', true, 'submission_id', v_existing);
  end if;

  update usage_monthly
  set completed_submissions = completed_submissions + 1,
      updated_at = now()
  where workspace_id = p_workspace_id and month = v_month;

  insert into outbox_events (workspace_id, type, payload)
  values (
    p_workspace_id,
    'form.submission.completed',
    jsonb_build_object('submissionId', v_id, 'formId', p_form_id)
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'submission_id', v_id);
end;
$$;

-- Lock down: only service_role may execute ------------------------------------
revoke all on function publish_form(uuid, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function publish_form(uuid, jsonb, jsonb, jsonb, uuid)
  to service_role;

revoke all on function submit_form(uuid, uuid, uuid, text, jsonb, jsonb, text, bigint, bigint)
  from public, anon, authenticated;
grant execute on function submit_form(uuid, uuid, uuid, text, jsonb, jsonb, text, bigint, bigint)
  to service_role;
