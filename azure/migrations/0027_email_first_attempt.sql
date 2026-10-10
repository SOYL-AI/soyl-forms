-- Only the transaction that creates a provider UUID may skip the recovery poll.
-- A crashed caller leaves the UUID persisted; the next caller must poll it.
create or replace function platform.email_operation(p_event uuid,p_lease uuid,p_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_reservation email_reservations%rowtype; v_fresh boolean := false;
begin
  select r.* into v_reservation from email_reservations r join outbox_events e on e.workspace_id=r.workspace_id
    where e.id=p_event and e.lease_token=p_lease and e.status='processing' and e.lease_until>now()
      and r.key=p_key and p_key in(p_event||':owners',p_event||':respondent') and r.status='reserved' for update of r;
  if not found then return null; end if;
  if v_reservation.provider_retry_at>now() then
    return to_jsonb(v_reservation)||jsonb_build_object('provider_operation_fresh',false);
  end if;
  if v_reservation.provider_first_sent_at is null then
    update email_reservations set provider_operation_id=gen_random_uuid(),provider_first_sent_at=clock_timestamp(),provider_retry_at=null
      where key=p_key returning * into v_reservation;
    v_fresh := true;
  end if;
  return to_jsonb(v_reservation)||jsonb_build_object('provider_operation_fresh',v_fresh);
end $$;
