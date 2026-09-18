-- 0001_init: core SaaS schema (Phase 0).
-- Conventions: UUID PKs, timestamptz UTC, workspace-scoped tenancy,
-- versioned immutable form publishes, JSONB answers keyed by block id.

create extension if not exists "pgcrypto";

-- Enums -----------------------------------------------------------------
do $$ begin create type workspace_status as enum ('active','suspended','deleted'); exception when duplicate_object then null; end $$;
do $$ begin create type member_role as enum ('owner','admin','editor','viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type billing_interval as enum ('monthly','yearly'); exception when duplicate_object then null; end $$;
do $$ begin create type subscription_status as enum ('free','created','authenticated','active','pending','halted','cancelled','expired'); exception when duplicate_object then null; end $$;
do $$ begin create type form_status as enum ('draft','published','closed','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type submission_status as enum ('completed','spam','deleted'); exception when duplicate_object then null; end $$;
do $$ begin create type file_status as enum ('pending','attached','deleted','quarantined'); exception when duplicate_object then null; end $$;
do $$ begin create type outbox_status as enum ('pending','processing','completed','failed'); exception when duplicate_object then null; end $$;
do $$ begin create type admin_role as enum ('super_admin','support_admin'); exception when duplicate_object then null; end $$;

-- Profiles (extends auth.users) ------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Workspaces --------------------------------------------------------------
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references auth.users (id),
  status workspace_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists idx_members_user on workspace_members (user_id);

-- Plans + subscriptions ---------------------------------------------------
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

-- Forms + versions ---------------------------------------------------------
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
  created_by uuid references auth.users (id),
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
  published_by uuid references auth.users (id),
  published_at timestamptz not null default now(),
  unique (form_id, version_number)
);
create index if not exists idx_versions_form on form_versions (form_id, version_number desc);

-- Analytics + submissions ---------------------------------------------------
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

-- Uploads ------------------------------------------------------------------
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

-- Outgoing webhooks ---------------------------------------------------------
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

-- Outbox (reliable post-submit work) -----------------------------------------
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

-- Monthly usage counters ------------------------------------------------------
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

-- Razorpay webhook idempotency --------------------------------------------------
create table if not exists razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_hash text not null,
  status text not null default 'received'
);

-- Admin + audit -------------------------------------------------------------------
create table if not exists admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role admin_role not null default 'support_admin',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
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

-- Row Level Security ---------------------------------------------------------------
-- Public respondents NEVER get direct insert on submissions: all writes go
-- through the server submission endpoint (service role). Authenticated access
-- is scoped to workspace membership; service role bypasses RLS server-side.

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

create policy "users_read_own_profile" on profiles
  for select using (auth.uid() = id);
create policy "users_update_own_profile" on profiles
  for update using (auth.uid() = id);

create policy "members_read_workspaces" on workspaces
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = workspaces.id and m.user_id = auth.uid()
    )
  );

create policy "members_read_forms" on forms
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = forms.workspace_id and m.user_id = auth.uid()
    )
  );
create policy "editors_write_forms" on forms
  for all using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = forms.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'editor')
    )
  );

create policy "members_read_versions" on form_versions
  for select using (
    exists (
      select 1 from forms f
      join workspace_members m on m.workspace_id = f.workspace_id
      where f.id = form_versions.form_id and m.user_id = auth.uid()
    )
  );

create policy "members_read_submissions" on submissions
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = submissions.workspace_id and m.user_id = auth.uid()
    )
  );
-- No insert/update/delete policies for anon on submissions: server endpoint only.
