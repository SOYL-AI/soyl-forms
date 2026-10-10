grant select(id,workspace_id,form_id,url,is_active,events,created_at) on webhooks to soyl_app;
create policy webhook_read on webhooks for select to soyl_app using(workspace_id in(select platform.readable_workspaces()));
create function platform.create_webhook(p_form uuid,p_url text,p_secret text,p_max integer) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_workspace uuid;v_id uuid;
begin
  select workspace_id into v_workspace from forms where id=p_form;
  perform 1 from workspaces where id=v_workspace for update;
  if not platform.can_access(v_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_max not between 0 and 100 or p_url !~ '^https://' or p_secret is null then raise exception 'Invalid webhook'; end if;
  if (select count(*) from webhooks where form_id=p_form)>=p_max then raise exception 'Webhook limit reached'; end if;
  insert into webhooks(workspace_id,form_id,url,secret_encrypted,is_active,events)
    values(v_workspace,p_form,p_url,p_secret,true,array['form.submission.completed']) returning id into v_id;
  return v_id;
end $$;
create function platform.change_webhook(p_id uuid,p_active boolean default null) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from webhooks where id=p_id;
  perform 1 from workspaces where id=v_workspace for update;
  if not platform.can_access(v_workspace,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_active is null then delete from webhooks where id=p_id;
  else update webhooks set is_active=p_active where id=p_id; end if;
  return found;
end $$;

create function platform.claim_job() returns jsonb
language sql security definer set search_path=pg_catalog,public,platform_private as $$
  select to_jsonb(e) from platform_private.claim_outbox_event() e;
$$;
create function platform.job_context(p_id uuid,p_lease uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('submission',to_jsonb(s),'version',to_jsonb(v),'subscription',to_jsonb(b),
    'hooks',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'delivered',exists(select 1 from webhook_deliveries d where d.webhook_id=h.id and d.event_id=e.id and d.delivered_at is not null)))
      from webhooks h where h.form_id=s.form_id and h.workspace_id=e.workspace_id and h.is_active),'[]'))
  from outbox_events e join workspaces w on w.id=e.workspace_id
    left join submissions s on s.id=(e.payload->>'submissionId')::uuid and s.workspace_id=e.workspace_id and s.deleted_at is null
    left join form_versions v on v.id=s.form_version_id and v.form_id=s.form_id
    left join subscriptions b on b.workspace_id=e.workspace_id
  where e.id=p_id and e.lease_token=p_lease and e.status='processing' and e.lease_until>now() and w.status='active';
$$;
create function platform.checkpoint_job(p_id uuid,p_lease uuid,p_payload jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update outbox_events set payload=p_payload,lease_until=now()+interval '2 minutes'
    where id=p_id and lease_token=p_lease and status='processing' and lease_until>now();
  return found;
end $$;
create function platform.finish_job(p_id uuid,p_lease uuid,p_payload jsonb,p_ok boolean,p_uncertain boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update outbox_events set payload=p_payload,status=case when p_ok then 'completed' when attempts>=5 or p_uncertain then 'failed' else 'pending' end,
    processed_at=case when p_ok or attempts>=5 or p_uncertain then now() else null end,
    available_at=now()+least(power(2,attempts),120)*interval '1 minute',lease_token=null,lease_until=null
    where id=p_id and lease_token=p_lease and status='processing' and lease_until>now();
  return found;
end $$;

create function platform.delivery_webhook(p_hook uuid,p_event uuid default null,p_lease uuid default null) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,platform as $$
  select jsonb_build_object('id',h.id,'url',h.url,'secret_encrypted',h.secret_encrypted,'is_active',h.is_active)
  from webhooks h join workspaces w on w.id=h.workspace_id where h.id=p_hook and w.status='active' and (
    platform.can_access(h.workspace_id,'editor') or exists(select 1 from outbox_events e join submissions s on s.id=(e.payload->>'submissionId')::uuid
      where e.id=p_event and e.lease_token=p_lease and e.status='processing' and e.lease_until>now() and e.workspace_id=h.workspace_id and s.form_id=h.form_id and s.deleted_at is null));
$$;
create function platform.record_delivery(p_hook uuid,p_event text,p_attempt integer,p_status integer,p_error text,p_lease uuid default null) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_allowed jsonb;
begin
  v_allowed:=platform.delivery_webhook(p_hook,case when p_lease is null then null else p_event::uuid end,p_lease);
  if v_allowed is null then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into webhook_deliveries(webhook_id,event_type,event_id,attempt,http_status,delivered_at,last_error)
    values(p_hook,'form.submission.completed',p_event::uuid,p_attempt,p_status,case when p_error is null then now() else null end,left(p_error,300));
  return true;
end $$;
create function platform.reserve_email(p_event uuid,p_lease uuid,p_key text,p_limit integer,p_quantity integer,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,platform_private as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from outbox_events where id=p_event and lease_token=p_lease and status='processing' and lease_until>now();
  if v_workspace is null or p_key not in (p_event||':owners',p_event||':respondent') or p_quantity not between 1 and 5 then raise exception 'Invalid email lease' using errcode='42501'; end if;
  return platform_private.reserve_notification_email(p_key,v_workspace,p_limit,p_quantity,p_request);
end $$;
create function platform.complete_email(p_event uuid,p_lease uuid,p_key text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update email_reservations r set status='sent',request='{}' where r.key=p_key and exists(select 1 from outbox_events e
    where e.id=p_event and e.lease_token=p_lease and e.status='processing' and e.lease_until>now() and e.workspace_id=r.workspace_id);
  return found;
end $$;

create function platform.cleanup_uploads() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,platform_private as $$
declare v_file record;v_expired jsonb;v_result jsonb:='[]';v_cutoff timestamptz:=now()-interval '1 day';
begin
  for v_file in select id,r2_key,status from uploaded_files where status in ('pending','deleted') and submission_id is null and created_at<v_cutoff order by created_at,id limit 100 loop
    if v_file.status='pending' then v_expired:=platform_private.expire_pending_upload(v_file.id,v_cutoff);
    else v_expired:=jsonb_build_object('id',v_file.id,'r2_key',v_file.r2_key); end if;
    if v_expired is not null then v_result:=v_result||jsonb_build_array(v_expired); end if;
  end loop;
  return v_result;
end $$;
create function platform.complete_upload_cleanup(p_id uuid,p_key text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  delete from uploaded_files where id=p_id and r2_key=p_key and status='deleted' and submission_id is null;
  return found;
end $$;
create function platform.cleanup_expired_data() returns integer
language plpgsql security definer set search_path=pg_catalog,public,identity as $$
declare v_deleted integer;
begin
  with candidates as(select id from partial_responses where updated_at<now()-interval '30 days' order by updated_at limit 100),
    removed as(delete from partial_responses where id in(select id from candidates) returning id)
  select count(*) into v_deleted from removed;
  delete from public_rate_limits where reset_at<now()-interval '1 day';
  update email_reservations set request='{}' where created_at<now()-interval '1 day' and status='reserved';
  perform identity.cleanup_expired();
  return v_deleted;
end $$;
revoke all on function platform.create_webhook(uuid,text,text,integer),platform.change_webhook(uuid,boolean),platform.claim_job(),platform.job_context(uuid,uuid),platform.checkpoint_job(uuid,uuid,jsonb),platform.finish_job(uuid,uuid,jsonb,boolean,boolean),platform.delivery_webhook(uuid,uuid,uuid),platform.record_delivery(uuid,text,integer,integer,text,uuid),platform.reserve_email(uuid,uuid,text,integer,integer,jsonb),platform.complete_email(uuid,uuid,text),platform.cleanup_uploads(),platform.complete_upload_cleanup(uuid,text),platform.cleanup_expired_data() from public;
grant execute on function platform.create_webhook(uuid,text,text,integer),platform.change_webhook(uuid,boolean),platform.claim_job(),platform.job_context(uuid,uuid),platform.checkpoint_job(uuid,uuid,jsonb),platform.finish_job(uuid,uuid,jsonb,boolean,boolean),platform.delivery_webhook(uuid,uuid,uuid),platform.record_delivery(uuid,text,integer,integer,text,uuid),platform.reserve_email(uuid,uuid,text,integer,integer,jsonb),platform.complete_email(uuid,uuid,text),platform.cleanup_uploads(),platform.complete_upload_cleanup(uuid,text),platform.cleanup_expired_data() to soyl_app;
