alter table subscriptions add column checkout_token uuid,add column checkout_expires_at timestamptz,add column provider_checked_at timestamptz;
create unique index purchased_credit_identity on ai_credit_ledger(ref) where reason='purchase' and ref is not null;

create function platform.begin_checkout(p_workspace uuid,p_plan text,p_interval billing_interval) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
declare v_sub subscriptions%rowtype; v_token uuid:=gen_random_uuid();
begin
  perform 1 from workspaces where id=p_workspace for update;
  if not platform.can_access(p_workspace,'owner') then raise exception 'Only owners manage billing' using errcode='42501'; end if;
  if p_plan not in ('starter','pro') then raise exception 'Invalid plan'; end if;
  select * into v_sub from subscriptions where workspace_id=p_workspace for update;
  if v_sub.status='created' and v_sub.plan_code=p_plan and v_sub.billing_interval=p_interval and v_sub.provider_subscription_id is not null then
    return jsonb_build_object('subscriptionId',v_sub.provider_subscription_id);
  end if;
  if v_sub.status not in ('free','cancelled','expired') then raise exception 'An existing subscription must be resolved before starting another'; end if;
  if v_sub.checkout_expires_at>now() then raise exception 'Checkout is already starting. Please wait'; end if;
  update subscriptions set checkout_token=v_token,checkout_expires_at=now()+interval '3 minutes' where workspace_id=p_workspace;
  return jsonb_build_object('token',v_token);
end $$;
create function platform.complete_checkout(p_workspace uuid,p_token uuid,p_id text,p_plan_id text,p_plan text,p_interval billing_interval) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  perform 1 from workspaces where id=p_workspace for update;
  if not platform.can_access(p_workspace,'owner') then raise exception 'Only owners manage billing' using errcode='42501'; end if;
  if p_id !~ '^sub_[A-Za-z0-9]+$' or p_plan not in ('starter','pro') then raise exception 'Invalid subscription'; end if;
  update subscriptions set provider_subscription_id=p_id,provider_plan_id=p_plan_id,plan_code=p_plan,billing_interval=p_interval,
    status='created',cancel_at_period_end=false,current_period_start=null,current_period_end=null,provider_checked_at=null,
    checkout_token=null,checkout_expires_at=null,updated_at=now()
    where workspace_id=p_workspace and checkout_token=p_token and checkout_expires_at>now();
  return found;
end $$;
create function platform.abort_checkout(p_workspace uuid,p_token uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if not platform.can_access(p_workspace,'owner') then raise exception 'Not authorized' using errcode='42501'; end if;
  update subscriptions set checkout_token=null,checkout_expires_at=null where workspace_id=p_workspace and checkout_token=p_token;
end $$;
create function platform.request_cancellation(p_workspace uuid,p_id text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,platform as $$
begin
  if not platform.can_access(p_workspace,'owner') then raise exception 'Not authorized' using errcode='42501'; end if;
  update subscriptions set cancel_at_period_end=true,updated_at=now() where workspace_id=p_workspace and provider_subscription_id=p_id;
  return found;
end $$;
create function platform.purchase_credits(p_workspace uuid,p_amount bigint,p_payment text) returns bigint
language plpgsql security definer set search_path=pg_catalog,public,platform,platform_private as $$
begin
  if not platform.can_access(p_workspace,'owner') then raise exception 'Only owners manage billing' using errcode='42501'; end if;
  if p_amount not between 1 and 100000 or p_payment !~ '^pay_[A-Za-z0-9]+$' then raise exception 'Invalid purchase'; end if;
  if exists(select 1 from ai_credit_ledger where reason='purchase' and ref=p_payment and workspace_id<>p_workspace) then raise exception 'Payment already claimed'; end if;
  return platform_private.grant_ai_credits(p_workspace,p_amount,'purchase',p_payment);
end $$;

-- Called only after HTTP signature verification and a fresh server-to-provider
-- subscription fetch. Event persistence, entitlement change and audit are one
-- transaction. Older concurrent observations cannot overwrite a newer snapshot.
create function platform.apply_billing_event(p_id text,p_event text,p_hash text,p_provider_id text,p_snapshot jsonb,p_observed timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_seen razorpay_webhook_events%rowtype; v_sub subscriptions%rowtype; v_workspace uuid; v_status subscription_status; v_terminal boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing-event:'||p_id,0));
  select * into v_seen from razorpay_webhook_events where event_id=p_id;
  if found then
    if v_seen.payload_hash<>p_hash then raise exception 'Event payload changed'; end if;
    if v_seen.processed_at is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
  end if;
  insert into razorpay_webhook_events(event_id,event_type,payload_hash,status) values(p_id,p_event,p_hash,'received') on conflict do nothing;
  if p_provider_id is null then
    update razorpay_webhook_events set status='ignored',processed_at=now() where event_id=p_id;
    return jsonb_build_object('ok',true,'ignored',true);
  end if;
  select workspace_id into v_workspace from subscriptions where provider_subscription_id=p_provider_id;
  if v_workspace is null then
    update razorpay_webhook_events set status='orphan',processed_at=now() where event_id=p_id;
    insert into audit_logs(actor_type,action,target_type,target_id) values('system','billing.webhook.orphan','subscription',p_provider_id);
    return jsonb_build_object('ok',true,'orphan',true);
  end if;
  perform 1 from workspaces where id=v_workspace for update;
  select * into v_sub from subscriptions where workspace_id=v_workspace and provider_subscription_id=p_provider_id for update;
  if not found then raise exception 'Subscription changed during reconciliation'; end if;
  if v_sub.provider_checked_at is null or v_sub.provider_checked_at<=p_observed then
    v_status:=case when p_snapshot->>'status'='completed' then 'expired' else p_snapshot->>'status' end::subscription_status;
    v_terminal:=v_status in ('cancelled','expired');
    update subscriptions set status=v_status,
      provider_plan_id=coalesce(p_snapshot->>'providerPlanId',provider_plan_id),
      plan_code=case when v_terminal then 'free' else coalesce(p_snapshot->>'plan',plan_code) end,
      billing_interval=case when v_terminal then null else coalesce((p_snapshot->>'interval')::billing_interval,billing_interval) end,
      current_period_start=(p_snapshot->>'currentPeriodStart')::timestamptz,current_period_end=(p_snapshot->>'currentPeriodEnd')::timestamptz,
      provider_checked_at=p_observed,updated_at=now() where workspace_id=v_workspace;
    insert into audit_logs(actor_type,workspace_id,action,target_type,target_id,metadata)
      values('system',v_workspace,'billing.'||p_event,'subscription',p_provider_id,jsonb_build_object('status',v_status));
  end if;
  update razorpay_webhook_events set status='processed',processed_at=now() where event_id=p_id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function platform.begin_checkout(uuid,text,billing_interval),platform.complete_checkout(uuid,uuid,text,text,text,billing_interval),platform.abort_checkout(uuid,uuid),platform.request_cancellation(uuid,text),platform.purchase_credits(uuid,bigint,text),platform.apply_billing_event(text,text,text,text,jsonb,timestamptz) from public;
grant execute on function platform.begin_checkout(uuid,text,billing_interval),platform.complete_checkout(uuid,uuid,text,text,text,billing_interval),platform.abort_checkout(uuid,uuid),platform.request_cancellation(uuid,text),platform.purchase_credits(uuid,bigint,text),platform.apply_billing_event(text,text,text,text,jsonb,timestamptz) to soyl_app;
