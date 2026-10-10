-- Azure platform baseline derived from reviewed historical migrations.
-- Original Supabase history is preserved; no Supabase auth/API roles are created.
-- All business functions are private until explicitly granted through scoped APIs.
-- 0001_init.sql sha256:11c0f33c16793ea2496203c7c55282d1a7aa0ff0cc4797b60810bdbe25604a5d
-- 0002_fix_forms_rls.sql sha256:aede27666c4e00c560e9f981ddbb5fd8ec528f1ff40c6f1fdb1e5863ebdf35c3
-- 0003_submit_publish.sql sha256:1c543ac6ab727e49fc85b4821e553db1f7fbfdd3d0e8e9cf848057e09198ab8f
-- 0004_publish_fix.sql sha256:d341d7d958678773a8a548e7441f0cb8a046fba3822c60eefdfb1d5fe79cb00f
-- 0005_uploads_index.sql sha256:0029ec162e3541eb6d0a40e600643cae40cf6181b56e9156e752b2fefef58058
-- 0006_ai_credits.sql sha256:a25c5ee09f1e1c7b32434d17b2f543efcf80efaff0834e671712c8a05dad67b4
-- 0007_billing_override.sql sha256:696ec443877f8eb1f9925587bd0a071351b21d825cf8fdc7c747cf89f684a3f8
-- 0008_brand_kits.sql sha256:04b4bf13fd9a5d27b9593eb3162bfe07b481e43dbfc7234d44a85716a0220855
-- 0009_phase2_teams_partials.sql sha256:5ed2afe457dc29732faefb8608bfcc1141eb2017365a49d42b42c342e1e49587
-- 0010_creator_payments.sql sha256:8f0dcf9d82e591905babd3a7b5ee438136dcd08da729607c241bcc5bb1a0a5ed
-- 0011_mcp_api_keys.sql sha256:b5f77b01750a6903f3fdea15c374d7486e7801037645bbb011badda12e258b52
-- 0012_submission_integrity.sql sha256:2b58a2a59e710e283521c4007d03f23d6d750ef242f2134cff71bb1b5f81e726
-- 0013_rate_limits_and_resume.sql sha256:a05177f92986c5216415df560030f2db7fc8861a22aa158fdc7b4fb35d637813
-- 0014_outbox_leases.sql sha256:9da57389f16e55db0f755d003c18848165efbd78d544b8b334487fa9ce616020
-- 0015_response_queries.sql sha256:54ba782c9af6139ae38e8afe49c4777d50e272c870befeb48aadcda6e1d443ae
-- 0016_upload_cleanup.sql sha256:cff769e75a4c28a58e37d66a4ab9a3e0d0c0e699c098dc55c7634f5ec17944c0
create schema platform_private;
revoke all on schema platform_private from public;
alter default privileges in schema platform_private revoke execute on functions from public;

do $$ begin create type workspace_status as enum ('active','suspended','deleted'); exception when duplicate_object then null; end $$;

do $$ begin create type member_role as enum ('owner','admin','editor','viewer'); exception when duplicate_object then null; end $$;

do $$ begin create type billing_interval as enum ('monthly','yearly'); exception when duplicate_object then null; end $$;

do $$ begin create type subscription_status as enum ('free','created','authenticated','active','pending','halted','cancelled','expired'); exception when duplicate_object then null; end $$;

do $$ begin create type form_status as enum ('draft','published','closed','archived'); exception when duplicate_object then null; end $$;

do $$ begin create type submission_status as enum ('completed','spam','deleted'); exception when duplicate_object then null; end $$;

do $$ begin create type file_status as enum ('pending','attached','deleted','quarantined'); exception when duplicate_object then null; end $$;

do $$ begin create type outbox_status as enum ('pending','processing','completed','failed'); exception when duplicate_object then null; end $$;

do $$ begin create type admin_role as enum ('super_admin','support_admin'); exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key references public.app_users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references public.app_users (id),
  status workspace_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_members_user on workspace_members (user_id);

create table if not exists plans (
  code text primary key,
  name text not null,
  monthly_price_inr_paise integer not null default 0,
  yearly_price_inr_paise integer not null default 0,
  is_active boolean not null default true
);

insert into plans (code, name, monthly_price_inr_paise, yearly_price_inr_paise)
values
  ('free', 'Free', 0, 0),
  ('starter', 'Starter', 19900, 199000),
  ('pro', 'Pro', 49900, 499000)
on conflict (code) do nothing;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces (id) on delete cascade,
  plan_code text not null default 'free' references plans (code),
  provider text not null default 'razorpay',
  provider_subscription_id text unique,
  provider_plan_id text,
  billing_interval billing_interval,
  status subscription_status not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_provider on subscriptions (provider_subscription_id);

create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  title text not null,
  slug text not null unique,
  status form_status not null default 'draft',
  draft_schema jsonb not null default '{"schemaVersion":1,"title":"","blocks":[],"logic":[]}',
  draft_revision bigint not null default 0,
  published_version_id uuid,
  theme jsonb not null default '{}',
  settings jsonb not null default '{}',
  branding jsonb not null default '{}',
  published_at timestamptz,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_forms_workspace on forms (workspace_id, updated_at desc);

create index if not exists idx_forms_slug on forms (slug);

create table if not exists form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  version_number integer not null,
  schema jsonb not null,
  theme jsonb not null default '{}',
  settings jsonb not null default '{}',
  published_by uuid references public.app_users (id),
  published_at timestamptz not null default now(),
  unique (form_id, version_number)
);

create index if not exists idx_versions_form on form_versions (form_id, version_number desc);

create table if not exists form_visits (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  form_version_id uuid references form_versions (id) on delete set null,
  session_id text not null,
  source text,
  referer_host text,
  country_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms bigint
);

create index if not exists idx_visits_form on form_visits (form_id, started_at desc);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  form_id uuid not null references forms (id) on delete cascade,
  form_version_id uuid not null references form_versions (id),
  idempotency_key text not null,
  answers jsonb not null default '{}',
  hidden_fields jsonb not null default '{}',
  source text,
  status submission_status not null default 'completed',
  duration_ms bigint,
  submitted_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (form_id, idempotency_key)
);

create index if not exists idx_submissions_form on submissions (form_id, submitted_at desc);

create index if not exists idx_submissions_workspace on submissions (workspace_id, submitted_at desc);

create table if not exists uploaded_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  form_id uuid references forms (id) on delete set null,
  submission_id uuid references submissions (id) on delete set null,
  question_id text,
  r2_key text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status file_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_files_workspace on uploaded_files (workspace_id);

create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  form_id uuid not null references forms (id) on delete cascade,
  url text not null,
  secret_encrypted text not null,
  is_active boolean not null default true,
  events text[] not null default array['form.submission.completed'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references webhooks (id) on delete cascade,
  event_type text not null,
  event_id uuid not null,
  attempt integer not null default 1,
  http_status integer,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text
);

create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  status outbox_status not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_outbox_pending on outbox_events (status, available_at);

create table if not exists usage_monthly (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  month date not null,
  completed_submissions bigint not null default 0,
  file_storage_bytes bigint not null default 0,
  notification_emails bigint not null default 0,
  webhook_attempts bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, month)
);

create table if not exists razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_hash text not null,
  status text not null default 'received'
);

create table if not exists admin_users (
  user_id uuid primary key references public.app_users (id) on delete cascade,
  role admin_role not null default 'support_admin',
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users (id) on delete set null,
  actor_type text not null default 'user',
  workspace_id uuid references workspaces (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}',
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_workspace on audit_logs (workspace_id, created_at desc);

alter table profiles enable row level security;

alter table workspaces enable row level security;

alter table workspace_members enable row level security;

alter table subscriptions enable row level security;

alter table forms enable row level security;

alter table form_versions enable row level security;

alter table form_visits enable row level security;

alter table submissions enable row level security;

alter table uploaded_files enable row level security;

alter table webhooks enable row level security;

alter table webhook_deliveries enable row level security;

alter table outbox_events enable row level security;

alter table usage_monthly enable row level security;

alter table audit_logs enable row level security;

create index if not exists idx_files_pending
  on uploaded_files (status, created_at);

create index if not exists idx_files_submission
  on uploaded_files (submission_id);

create table if not exists ai_credits (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  balance bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  delta bigint not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now(),
  unique (workspace_id, reason, ref)
);

create index if not exists idx_ai_ledger_workspace
  on ai_credit_ledger (workspace_id, created_at desc);

alter table ai_credits enable row level security;

alter table ai_credit_ledger enable row level security;

alter table subscriptions
  add column if not exists override_reason text,
  add column if not exists override_expires_at timestamptz;

create table if not exists brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  logo_url text,
  logo_file_id uuid,
  colors jsonb not null default '{}',
  fonts jsonb not null default '{}',
  voice jsonb not null default '{}',
  style jsonb not null default '{}',
  summary text not null default '',
  sources jsonb not null default '[]',
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_kits_workspace on brand_kits (workspace_id, updated_at desc);

create unique index if not exists idx_brand_kits_one_default
  on brand_kits (workspace_id) where is_default;

alter table brand_kits enable row level security;

alter table forms
  add column if not exists brand_kit_id uuid references brand_kits (id) on delete set null;

alter table uploaded_files
  add column if not exists kind text not null default 'submission',
  add column if not exists brand_kit_id uuid references brand_kits (id) on delete set null;

create index if not exists idx_files_kind on uploaded_files (kind, status);

alter table brand_kits
  add constraint brand_kits_logo_file_fk
  foreign key (logo_file_id) references uploaded_files (id) on delete set null
  not valid;

create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.app_users (id),
  updated_at timestamptz not null default now()
);

insert into platform_settings (key, value)
values (
  'flags',
  '{"registrationsEnabled":true,"uploadsEnabled":true,"upgradesEnabled":true,"aiEnabled":true,"maintenanceBanner":""}'
)
on conflict (key) do nothing;

alter table platform_settings enable row level security;

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  email text not null,
  role member_role not null default 'viewer',
  token text not null unique,
  invited_by uuid references public.app_users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create index if not exists idx_invites_workspace on workspace_invites (workspace_id, created_at desc);

create index if not exists idx_invites_token on workspace_invites (token);

alter table workspace_invites enable row level security;

alter table submissions add column if not exists tags text[] not null default '{}';

alter table submissions add column if not exists edited_at timestamptz;

alter table form_visits add column if not exists last_block_id text;

alter table form_visits add column if not exists progress_at timestamptz;

create table if not exists partial_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  form_version_id uuid references form_versions (id) on delete set null,
  session_id text not null,
  token text not null unique,
  answers jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, session_id)
);

create index if not exists idx_partials_form on partial_responses (form_id, updated_at desc);

alter table partial_responses enable row level security;

create table if not exists workspace_payment_providers (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  provider text not null default 'razorpay',
  key_id text not null,
  secret_encrypted text not null,
  mode text not null default 'test',
  status text not null default 'active',
  connected_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workspace_payment_providers enable row level security;

create table if not exists form_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  form_id uuid not null references forms (id) on delete cascade,
  form_version_id uuid references form_versions (id) on delete set null,
  submission_id uuid references submissions (id) on delete set null,
  block_id text not null,
  order_id text not null unique,
  payment_id text,
  amount_paise integer not null,
  currency text not null default 'INR',
  status text not null default 'created',
  respondent_email text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_payments_form on form_payments (form_id, created_at desc);

create index if not exists idx_payments_order on form_payments (order_id);

alter table form_payments enable row level security;

create table if not exists workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null default 'mcp',
  key_prefix text not null,
  key_hash text not null,
  created_by uuid references public.app_users (id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_api_keys_hash on workspace_api_keys (key_hash);

create index if not exists idx_api_keys_workspace on workspace_api_keys (workspace_id, created_at desc);

alter table workspace_api_keys enable row level security;

alter table uploaded_files add column if not exists verified_at timestamptz;

alter table uploaded_files add column if not exists upload_token_hash text;

alter table form_visits add column if not exists reached_blocks text[] not null default '{}';

create unique index if not exists idx_payments_payment_id on form_payments(payment_id) where payment_id is not null;

create table if not exists public_rate_limits (
  key text primary key, hits integer not null, reset_at timestamptz not null
);

alter table public_rate_limits enable row level security;

alter table partial_responses add column if not exists idempotency_key text;

alter table partial_responses add column if not exists current_block_id text;

alter table partial_responses add column if not exists history text[] not null default '{}';

alter table outbox_events add column if not exists lease_token uuid;

alter table outbox_events add column if not exists lease_until timestamptz;

create table if not exists email_reservations (
  key text primary key, workspace_id uuid not null references workspaces(id) on delete cascade,
  month date not null, status text not null default 'reserved', quantity integer not null,
  request jsonb not null, created_at timestamptz not null default now()
);

alter table email_reservations enable row level security;

delete from form_visits a using form_visits b where a.form_id = b.form_id and a.session_id = b.session_id
  and (a.started_at, a.id) > (b.started_at, b.id);

create unique index if not exists idx_visits_session on form_visits(form_id, session_id);

update partial_responses set idempotency_key = gen_random_uuid()::text where idempotency_key is null;

create or replace function platform_private.publish_form(
  p_form_id uuid,
  p_schema jsonb,
  p_theme jsonb,
  p_settings jsonb,
  p_published_by uuid
)
returns table (version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = pg_catalog, public, platform_private
as $$
declare
  v_num integer;
  v_id uuid;
begin
  perform 1 from forms f where f.id = p_form_id for update;
  if not found then
    raise exception 'FORM_NOT_FOUND';
  end if;

  select coalesce(max(fv.version_number), 0) + 1 into v_num
  from form_versions fv
  where fv.form_id = p_form_id;

  insert into form_versions (form_id, version_number, schema, theme, settings, published_by)
  values (p_form_id, v_num, p_schema, p_theme, p_settings, p_published_by)
  returning form_versions.id into v_id;

  update forms f
  set published_version_id = v_id,
      status = 'published',
      published_at = now(),
      updated_at = now()
  where f.id = p_form_id;

  return query select v_id, v_num;
end;
$$;

create or replace function platform_private.grant_ai_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_reason text,
  p_ref text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, platform_private
as $$
declare
  v_balance bigint;
begin
  insert into ai_credit_ledger (workspace_id, delta, reason, ref)
  values (p_workspace_id, p_amount, p_reason, p_ref)
  on conflict (workspace_id, reason, ref) do nothing;

  if not found then
    select balance into v_balance from ai_credits where workspace_id = p_workspace_id;
    return coalesce(v_balance, 0);
  end if;

  insert into ai_credits (workspace_id, balance)
  values (p_workspace_id, p_amount)
  on conflict (workspace_id)
  do update set balance = ai_credits.balance + excluded.balance,
                updated_at = now()
  returning balance into v_balance;

  return v_balance;
end;
$$;

create or replace function platform_private.spend_ai_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, platform_private
as $$
declare
  v_ok boolean := false;
begin
  update ai_credits
  set balance = balance - p_amount,
      updated_at = now()
  where workspace_id = p_workspace_id
    and balance >= p_amount;

  if found then
    insert into ai_credit_ledger (workspace_id, delta, reason)
    values (p_workspace_id, -p_amount, p_reason);
    v_ok := true;
  end if;

  return v_ok;
end;
$$;

create or replace function platform_private.submit_form_safe(
  p_form_id uuid, p_workspace_id uuid, p_version_id uuid,
  p_idempotency_key text, p_answers jsonb, p_hidden jsonb,
  p_source text, p_duration_ms bigint, p_monthly_limit bigint,
  p_session_id text default null, p_resume_token text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
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

create or replace function platform_private.reserve_upload(p_file jsonb, p_storage_limit bigint)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
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

create or replace function platform_private.consume_rate_limit(p_key text, p_limit integer, p_window_ms integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
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

create or replace function platform_private.save_partial_response(p_form_id uuid, p_version_id uuid, p_session_id text,
  p_token text, p_answers jsonb, p_idempotency_key text, p_current_block_id text, p_history text[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
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

create or replace function platform_private.claim_outbox_event()
returns setof outbox_events language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
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

create or replace function platform_private.reserve_notification_email(p_key text, p_workspace_id uuid, p_limit integer, p_quantity integer, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
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

create or replace function platform_private.record_form_progress(p_form_id uuid, p_session_id text, p_block_id text)
returns void language sql security definer set search_path = pg_catalog, public, platform_private as $$
  update form_visits set last_block_id = p_block_id, progress_at = now(),
    reached_blocks = case when p_block_id = any(reached_blocks) then reached_blocks else array_append(reached_blocks, p_block_id) end
    where form_id = p_form_id and session_id = p_session_id and completed_at is null;
$$;

create or replace function platform_private.form_analytics(p_form_id uuid, p_question_ids text[])
returns jsonb language sql stable security definer set search_path = pg_catalog, public, platform_private as $$
  with responses as (
    select * from submissions where form_id = p_form_id and deleted_at is null and status = 'completed'
  ), days as (
    select (submitted_at at time zone 'UTC')::date as day, count(*) as count from responses
    where submitted_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '13 days'
    group by 1
  ), answer_counts as (
    select e.key, jsonb_build_object('type', e.value->'type', 'value', e.value->'value') as answer, count(*) as count
    from responses s cross join lateral jsonb_each(s.answers) e
    where e.key = any(p_question_ids) group by 1, 2
  ), grouped_answers as (
    select key, jsonb_agg(jsonb_build_object('answer', answer, 'count', count)) as groups from answer_counts group by key
  ), reached as (
    select block_id, count(distinct v.id) as count from form_visits v
    cross join lateral unnest(case when cardinality(v.reached_blocks) > 0 then v.reached_blocks
      when v.last_block_id is not null then array[v.last_block_id] else '{}'::text[] end) block_id
    where v.form_id = p_form_id group by block_id
  ) select jsonb_build_object(
    'views', (select count(*) from form_visits where form_id = p_form_id),
    'completions', (select count(*) from responses),
    'completedVisits', (select count(*) from form_visits where form_id = p_form_id and completed_at is not null),
    'avgSecs', (select round(avg(duration_ms)/1000) from responses where duration_ms > 0),
    'fromQr', (select count(*) from responses where source = 'qr'),
    'days', coalesce((select jsonb_object_agg(day::text, count) from days), '{}'),
    'answers', coalesce((select jsonb_object_agg(key, groups) from grouped_answers), '{}'),
    'reached', coalesce((select jsonb_object_agg(block_id, count) from reached), '{}'),
    'abandoned', (select count(*) from form_visits where form_id = p_form_id and completed_at is null and coalesce(progress_at, started_at) <= now() - interval '30 minutes'),
    'inProgress', (select count(*) from form_visits where form_id = p_form_id and completed_at is null and coalesce(progress_at, started_at) > now() - interval '30 minutes')
  );
$$;

create or replace function platform_private.search_form_responses(p_form_id uuid, p_query text default '', p_tag text default '',
  p_from timestamptz default null, p_to timestamptz default null, p_offset integer default 0, p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = pg_catalog, public, platform_private as $$
  with matching as (
    select id, submitted_at, source, answers, tags from submissions
    where form_id = p_form_id and deleted_at is null
      and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at < p_to)
      and (coalesce(p_query, '') = '' or strpos(lower(answers::text), lower(p_query)) > 0)
      and (coalesce(p_tag, '') = '' or p_tag = any(tags))
  ), paged as (
    select * from matching order by submitted_at desc, id desc
    offset greatest(0, least(p_offset, 1000000)) limit greatest(1, least(p_limit, 100))
  ), all_tags as (
    select distinct unnest(tags) as tag from submissions where form_id = p_form_id and deleted_at is null
  ) select jsonb_build_object('total', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by submitted_at desc, id desc) from paged), '[]'),
    'tags', coalesce((select jsonb_agg(tag order by tag) from all_tags), '[]'));
$$;

create or replace function platform_private.expire_pending_upload(p_id uuid, p_cutoff timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, platform_private as $$
declare v_file uploaded_files%rowtype;
begin
  select * into v_file from uploaded_files where id = p_id;
  if not found then return null; end if;
  perform 1 from workspaces where id = v_file.workspace_id for update;
  select * into v_file from uploaded_files where id = p_id for update;
  if not found or v_file.status <> 'pending' or v_file.submission_id is not null
     or v_file.created_at >= p_cutoff then return null; end if;
  update uploaded_files set status = 'deleted' where id = p_id;
  return jsonb_build_object('id', v_file.id, 'r2_key', v_file.r2_key);
end;
$$;
revoke all on all functions in schema platform_private from public;
