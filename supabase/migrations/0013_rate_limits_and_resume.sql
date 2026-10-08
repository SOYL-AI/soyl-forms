create table if not exists public_rate_limits (
  key text primary key, hits integer not null, reset_at timestamptz not null
);
alter table public_rate_limits enable row level security;
revoke all on public_rate_limits from anon, authenticated;
create or replace function consume_rate_limit(p_key text, p_limit integer, p_window_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public_rate_limits%rowtype;
begin
  insert into public_rate_limits(key, hits, reset_at)
    values(p_key, 1, clock_timestamp() + p_window_ms * interval '1 millisecond')
    on conflict(key) do update set
      hits = case when public_rate_limits.reset_at <= clock_timestamp() then 1 else least(public_rate_limits.hits + 1, p_limit + 1) end,
      reset_at = case when public_rate_limits.reset_at <= clock_timestamp()
        then clock_timestamp() + p_window_ms * interval '1 millisecond' else public_rate_limits.reset_at end
    returning * into v_row;
  return jsonb_build_object('ok', v_row.hits <= p_limit, 'retryAfterMs',
    greatest(0, ceil(extract(epoch from(v_row.reset_at - clock_timestamp())) * 1000)));
end;
$$;
revoke all on function consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function consume_rate_limit(text, integer, integer) to service_role;

alter table partial_responses add column if not exists idempotency_key text;
alter table partial_responses add column if not exists current_block_id text;
alter table partial_responses add column if not exists history text[] not null default '{}';

-- Token identifies a single row across devices; locking the form also serializes first saves.
create or replace function save_partial_response(p_form_id uuid, p_version_id uuid, p_session_id text,
  p_token text, p_answers jsonb, p_idempotency_key text, p_current_block_id text, p_history text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row partial_responses%rowtype;
begin
  perform 1 from forms where id = p_form_id and status = 'published' for update;
  if not found then return null; end if;
  if exists(select 1 from submissions where form_id = p_form_id and idempotency_key = p_idempotency_key) then return null; end if;
  if p_token is not null then
    select * into v_row from partial_responses where form_id = p_form_id and token = p_token
      and updated_at > now() - interval '30 days' for update;
    if not found then return null; end if;
    if v_row.form_version_id <> p_version_id then return null; end if;
    -- Keep the original session and submission identity, even on another device.
    update partial_responses set answers = p_answers, current_block_id = p_current_block_id,
      history = p_history, updated_at = now() where id = v_row.id returning * into v_row;
  else
    insert into partial_responses(form_id, form_version_id, session_id, token, answers, idempotency_key, current_block_id, history)
      values(p_form_id, p_version_id, p_session_id, replace(gen_random_uuid()::text, '-', ''),
        p_answers, p_idempotency_key, p_current_block_id, p_history)
      on conflict(form_id, session_id) do update set answers = excluded.answers,
        current_block_id = excluded.current_block_id, history = excluded.history, updated_at = now()
      returning * into v_row;
  end if;
  return jsonb_build_object('token', v_row.token, 'sessionId', v_row.session_id, 'idempotencyKey', v_row.idempotency_key);
end;
$$;
revoke all on function save_partial_response(uuid, uuid, text, text, jsonb, text, text, text[]) from public, anon, authenticated;
grant execute on function save_partial_response(uuid, uuid, text, text, jsonb, text, text, text[]) to service_role;
