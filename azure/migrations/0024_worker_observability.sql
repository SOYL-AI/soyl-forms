-- Workers expose queue counts and age only, never payloads or destinations.
create function platform.worker_queue_status() returns jsonb
language sql stable security definer set search_path=pg_catalog,public,identity as $$
  select jsonb_build_object(
    'pending',count(*) filter(where status='pending'),
    'processing',count(*) filter(where status='processing'),
    'failed24h',count(*) filter(where status='failed' and processed_at>=now()-interval '1 day'),
    'oldestPendingSeconds',coalesce(greatest(0,extract(epoch from now()-min(created_at) filter(where status in ('pending','processing'))))::bigint,0),
    'accountDeletions',(select count(*) from identity.deletion_requests),
    'oldestDeletionSeconds',(select coalesce(greatest(0,extract(epoch from now()-min(requested_at)))::bigint,0) from identity.deletion_requests)
  ) from outbox_events where type='form.submission.completed';
$$;
revoke all on function platform.worker_queue_status() from public;
grant execute on function platform.worker_queue_status() to soyl_app;
