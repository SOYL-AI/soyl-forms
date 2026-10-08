alter table outbox_events add column if not exists lease_token uuid;
alter table outbox_events add column if not exists lease_until timestamptz;

create or replace function claim_outbox_event()
returns setof outbox_events language plpgsql security definer set search_path = public as $$
begin
  update outbox_events set status = 'failed', processed_at = now()
    where attempts >= 5 and (status = 'pending' or (status = 'processing' and coalesce(lease_until, created_at) <= now()));
  return query
    with candidate as (
      select id from outbox_events where type = 'form.submission.completed' and attempts < 5
        and ((status = 'pending' and available_at <= now()) or
             (status = 'processing' and coalesce(lease_until, created_at) <= now()))
      order by available_at for update skip locked limit 1
    )
    update outbox_events e set status = 'processing', lease_token = gen_random_uuid(),
      lease_until = now() + interval '2 minutes', attempts = e.attempts + 1
    from candidate c where e.id = c.id returning e.*;
end;
$$;
revoke all on function claim_outbox_event() from public, anon, authenticated;
grant execute on function claim_outbox_event() to service_role;

create table if not exists email_reservations (
  key text primary key, workspace_id uuid not null references workspaces(id) on delete cascade,
  month date not null, status text not null default 'reserved', quantity integer not null,
  request jsonb not null, created_at timestamptz not null default now()
);
alter table email_reservations enable row level security;
revoke all on email_reservations from anon, authenticated;
create or replace function reserve_notification_email(p_key text, p_workspace_id uuid, p_limit integer, p_quantity integer, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_reservation email_reservations%rowtype; v_month date := date_trunc('month', now() at time zone 'UTC')::date; v_used bigint;
begin
  perform 1 from workspaces where id = p_workspace_id for update;
  select * into v_reservation from email_reservations where key = p_key and workspace_id = p_workspace_id;
  if found then return to_jsonb(v_reservation); end if;
  insert into usage_monthly(workspace_id, month) values(p_workspace_id, v_month) on conflict do nothing;
  select notification_emails into v_used from usage_monthly where workspace_id = p_workspace_id and month = v_month for update;
  if p_quantity < 1 or v_used + p_quantity > p_limit then return jsonb_build_object('status', 'limited'); end if;
  insert into email_reservations(key, workspace_id, month, quantity, request) values(p_key, p_workspace_id, v_month, p_quantity, p_request) returning * into v_reservation;
  update usage_monthly set notification_emails = notification_emails + p_quantity, updated_at = now()
    where workspace_id = p_workspace_id and month = v_month;
  return to_jsonb(v_reservation);
end;
$$;
revoke all on function reserve_notification_email(text, uuid, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function reserve_notification_email(text, uuid, integer, integer, jsonb) to service_role;
