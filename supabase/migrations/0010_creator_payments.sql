-- 0010_creator_payments: workspaces connect their OWN Razorpay keys
-- (connected-keys model — platform never touches respondent money).
-- Secrets are AES-256-GCM encrypted with WEBHOOK_ENCRYPTION_KEY; only the
-- public key id is ever readable. Every INSERT policy carries WITH CHECK.

-- Creator's Razorpay connection (one per workspace for v1) -------------------
create table if not exists workspace_payment_providers (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  provider text not null default 'razorpay',
  key_id text not null,
  secret_encrypted text not null,
  mode text not null default 'test',
  status text not null default 'active',
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workspace_payment_providers enable row level security;

-- Owners/admins may see the connection status + key id (never the secret)
-- from a user-owned client; all writes go through server actions.
create policy "admins_read_providers" on workspace_payment_providers
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = workspace_payment_providers.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- In-form payments ------------------------------------------------------------
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

-- Workspace members read their forms' payments from a user-owned client.
create policy "members_read_payments" on form_payments
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = form_payments.workspace_id
        and m.user_id = auth.uid()
    )
  );
