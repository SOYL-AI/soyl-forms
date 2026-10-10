create or replace function platform.finish_job(p_id uuid,p_lease uuid,p_payload jsonb,p_ok boolean,p_uncertain boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update outbox_events set payload=p_payload,status=(case when p_ok then 'completed' when attempts>=5 or p_uncertain then 'failed' else 'pending' end)::outbox_status,
    processed_at=case when p_ok or attempts>=5 or p_uncertain then now() else null end,
    available_at=now()+least(power(2,attempts),120)*interval '1 minute',lease_token=null,lease_until=null
    where id=p_id and lease_token=p_lease and status='processing' and lease_until>now();
  return found;
end $$;
revoke all on function platform.finish_job(uuid,uuid,jsonb,boolean,boolean) from public;
grant execute on function platform.finish_job(uuid,uuid,jsonb,boolean,boolean) to soyl_app;
