-- PostgreSQL does not infer enum types from a CASE expression's text literals.
create or replace function platform.defer_job(p_event uuid,p_lease uuid,p_payload jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update outbox_events set payload=p_payload,
    status=(case when created_at<now()-interval '1 day' then 'failed' else 'pending' end)::outbox_status,
    processed_at=case when created_at<now()-interval '1 day' then now() else null end,
    attempts=greatest(0,attempts-1),available_at=now()+interval '1 minute',lease_token=null,lease_until=null
    where id=p_event and lease_token=p_lease and status='processing' and lease_until>now();
  return found;
end $$;
