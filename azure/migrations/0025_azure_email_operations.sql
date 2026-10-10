-- Persist ACS operation identity before the network call. Only explicit HTTP
-- throttling permits a new identity; ambiguous requests retain their original ID.
alter table email_reservations add column provider_operation_id uuid;
alter table email_reservations add column provider_first_sent_at timestamptz;
alter table email_reservations add column provider_retry_at timestamptz;

create function platform.email_operation(p_event uuid,p_lease uuid,p_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_reservation email_reservations%rowtype;
begin
  select r.* into v_reservation from email_reservations r join outbox_events e on e.workspace_id=r.workspace_id
    where e.id=p_event and e.lease_token=p_lease and e.status='processing' and e.lease_until>now()
      and r.key=p_key and p_key in(p_event||':owners',p_event||':respondent') and r.status='reserved' for update of r;
  if not found then return null; end if;
  if v_reservation.provider_retry_at>now() then return to_jsonb(v_reservation); end if;
  if v_reservation.provider_first_sent_at is null then
    update email_reservations set provider_operation_id=gen_random_uuid(),provider_first_sent_at=clock_timestamp(),provider_retry_at=null
      where key=p_key returning * into v_reservation;
  end if;
  return to_jsonb(v_reservation);
end $$;

create function platform.defer_email(p_event uuid,p_lease uuid,p_key text,p_operation uuid,p_seconds integer) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update email_reservations r set provider_operation_id=null,provider_first_sent_at=null,
    provider_retry_at=now()+greatest(60,least(3600,p_seconds))*interval '1 second'
    where r.key=p_key and r.status='reserved' and r.provider_operation_id=p_operation
      and p_key in(p_event||':owners',p_event||':respondent') and exists(select 1 from outbox_events e
        where e.id=p_event and e.lease_token=p_lease and e.status='processing' and e.lease_until>now() and e.workspace_id=r.workspace_id);
  return found;
end $$;

-- Provider throttling and accepted operations still running do not exhaust the
-- five failure attempts. A 24-hour ceiling bounds retention and queues.
create function platform.defer_job(p_event uuid,p_lease uuid,p_payload jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update outbox_events set payload=p_payload,
    status=case when created_at<now()-interval '1 day' then 'failed' else 'pending' end,
    processed_at=case when created_at<now()-interval '1 day' then now() else null end,
    attempts=greatest(0,attempts-1),available_at=now()+interval '1 minute',lease_token=null,lease_until=null
    where id=p_event and lease_token=p_lease and status='processing' and lease_until>now();
  return found;
end $$;
revoke all on function platform.email_operation(uuid,uuid,text),platform.defer_email(uuid,uuid,text,uuid,integer),platform.defer_job(uuid,uuid,jsonb) from public;
grant execute on function platform.email_operation(uuid,uuid,text),platform.defer_email(uuid,uuid,text,uuid,integer),platform.defer_job(uuid,uuid,jsonb) to soyl_app;
