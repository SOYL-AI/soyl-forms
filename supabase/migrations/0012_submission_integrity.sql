-- All submission effects commit together. Lock order: workspace, form, payments, files.
alter table uploaded_files add column if not exists verified_at timestamptz;
alter table uploaded_files add column if not exists upload_token_hash text;
alter table form_visits add column if not exists reached_blocks text[] not null default '{}';
create unique index if not exists idx_payments_payment_id on form_payments(payment_id) where payment_id is not null;

-- Secrets must never be selectable via the user-owned Data API client.
revoke all on workspace_payment_providers from anon, authenticated;
grant select (workspace_id, provider, key_id, mode, status, connected_by, created_at, updated_at)
  on workspace_payment_providers to authenticated;
revoke all on webhooks from anon, authenticated;
grant select (id, workspace_id, form_id, url, is_active, events, created_at, updated_at)
  on webhooks to authenticated;

create or replace function submit_form_safe(
  p_form_id uuid, p_workspace_id uuid, p_version_id uuid,
  p_idempotency_key text, p_answers jsonb, p_hidden jsonb,
  p_source text, p_duration_ms bigint, p_monthly_limit bigint,
  p_session_id text default null, p_resume_token text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_form forms%rowtype;
  v_settings jsonb;
  v_existing submissions%rowtype;
  v_id uuid := gen_random_uuid();
  v_count bigint;
  v_limit bigint;
  v_entry record;
  v_file jsonb;
  v_payment form_payments%rowtype;
  v_upload uploaded_files%rowtype;
  v_payment_ids uuid[] := '{}';
  v_file_ids uuid[] := '{}';
begin
  perform 1 from workspaces where id = p_workspace_id and status = 'active' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNAVAILABLE'); end if;
  select * into v_existing from submissions where form_id = p_form_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'submission_id', v_existing.id);
  end if;
  select * into v_form from forms where id = p_form_id and workspace_id = p_workspace_id for update;
  if not found or v_form.status <> 'published' then
    return jsonb_build_object('ok', false, 'error', 'CLOSED');
  end if;
  select settings into v_settings from form_versions where id = v_form.published_version_id and form_id = p_form_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNAVAILABLE'); end if;
  if nullif(v_settings->>'closeAt', '')::timestamptz <= now() then
    return jsonb_build_object('ok', false, 'error', 'CLOSED');
  end if;
  perform 1 from form_versions where id = p_version_id and form_id = p_form_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'VERSION_MISMATCH'); end if;
  v_limit := nullif(v_settings->>'submissionLimit', '')::bigint;
  if v_limit > 0 and (select count(*) from submissions where form_id = p_form_id and deleted_at is null) >= v_limit then
    return jsonb_build_object('ok', false, 'error', 'FORM_LIMIT_REACHED');
  end if;
  insert into usage_monthly(workspace_id, month) values(p_workspace_id, v_month) on conflict do nothing;
  select completed_submissions into v_count from usage_monthly where workspace_id = p_workspace_id and month = v_month for update;
  if v_count >= p_monthly_limit then return jsonb_build_object('ok', false, 'error', 'LIMIT_REACHED'); end if;

  for v_entry in select key, value from jsonb_each(p_answers) order by key loop
    if v_entry.value->>'type' = 'payment' then
      select * into v_payment from form_payments
      where form_id = p_form_id and workspace_id = p_workspace_id
        and form_version_id = p_version_id and block_id = v_entry.key
        and payment_id = v_entry.value->'value'->>'payment_id'
        and order_id = v_entry.value->'value'->>'order_id'
        and amount_paise = (v_entry.value->'value'->>'amount_paise')::integer
        and currency = 'INR' and status = 'paid' and submission_id is null for update;
      if not found or v_payment.id = any(v_payment_ids) then
        return jsonb_build_object('ok', false, 'error', 'PAYMENT_MISMATCH');
      end if;
      v_payment_ids := array_append(v_payment_ids, v_payment.id);
    elsif v_entry.value->>'type' = 'file_upload' then
      for v_file in select value from jsonb_array_elements(v_entry.value->'value') loop
        select * into v_upload from uploaded_files where id = (v_file #>> '{}')::uuid
          and workspace_id = p_workspace_id and form_id = p_form_id and question_id = v_entry.key
          and kind = 'submission' and status = 'pending' and submission_id is null
          and verified_at is not null for update;
        if not found or v_upload.id = any(v_file_ids) then
          return jsonb_build_object('ok', false, 'error', 'FILE_MISMATCH');
        end if;
        v_file_ids := array_append(v_file_ids, v_upload.id);
      end loop;
    end if;
  end loop;

  insert into submissions(id, workspace_id, form_id, form_version_id, idempotency_key, answers, hidden_fields, source, duration_ms)
    values(v_id, p_workspace_id, p_form_id, p_version_id, p_idempotency_key, p_answers, p_hidden, p_source, p_duration_ms);
  update form_payments set submission_id = v_id where id = any(v_payment_ids);
  update uploaded_files set submission_id = v_id, status = 'attached' where id = any(v_file_ids);
  update usage_monthly set completed_submissions = completed_submissions + 1, updated_at = now()
    where workspace_id = p_workspace_id and month = v_month;
  update form_visits set completed_at = now(), duration_ms = p_duration_ms
    where form_id = p_form_id and session_id = p_session_id and completed_at is null;
  delete from partial_responses where form_id = p_form_id
    and (session_id = p_session_id or (p_resume_token is not null and token = p_resume_token));
  insert into outbox_events(workspace_id, type, payload)
    values(p_workspace_id, 'form.submission.completed', jsonb_build_object('submissionId', v_id, 'formId', p_form_id));
  return jsonb_build_object('ok', true, 'duplicate', false, 'submission_id', v_id);
end;
$$;
revoke all on function submit_form_safe(uuid, uuid, uuid, text, jsonb, jsonb, text, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function submit_form_safe(uuid, uuid, uuid, text, jsonb, jsonb, text, bigint, bigint, text, text) to service_role;
-- Stale application instances must not use the unsafe pipeline after rollout.
revoke all on function submit_form(uuid, uuid, uuid, text, jsonb, jsonb, text, bigint, bigint) from service_role;

-- Reservation counts ALL rows in PostgreSQL and serializes concurrent uploads.
create or replace function reserve_upload(p_file jsonb, p_storage_limit bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_used bigint;
begin
  perform 1 from workspaces where id = (p_file->>'workspace_id')::uuid and status = 'active' for update;
  if not found then return false; end if;
  select coalesce(sum(size_bytes), 0) into v_used from uploaded_files
    where workspace_id = (p_file->>'workspace_id')::uuid and status <> 'deleted';
  if (p_file->>'size_bytes')::bigint <= 0 or v_used + (p_file->>'size_bytes')::bigint > p_storage_limit then return false; end if;
  insert into uploaded_files(id, workspace_id, form_id, brand_kit_id, question_id, r2_key, original_name, mime_type, size_bytes, kind, upload_token_hash)
    values((p_file->>'id')::uuid, (p_file->>'workspace_id')::uuid, (p_file->>'form_id')::uuid,
      (p_file->>'brand_kit_id')::uuid, p_file->>'question_id', p_file->>'r2_key', p_file->>'original_name',
      p_file->>'mime_type', (p_file->>'size_bytes')::bigint, p_file->>'kind', p_file->>'upload_token_hash');
  return true;
end;
$$;
revoke all on function reserve_upload(jsonb, bigint) from public, anon, authenticated;
grant execute on function reserve_upload(jsonb, bigint) to service_role;
