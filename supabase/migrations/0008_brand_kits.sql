-- 0008_brand_kits: brand kits, creator-owned assets, platform feature flags.
--
-- Brand kits hold a workspace's palette/type/voice/logo so AI generation
-- and the design panel can produce on-brand forms. Creator assets (logos,
-- question images) reuse uploaded_files with a `kind`, so quotas and the
-- private-bucket rules stay in one place.

-- Brand kits -----------------------------------------------------------------
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
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_brand_kits_workspace on brand_kits (workspace_id, updated_at desc);
-- At most one default kit per workspace.
create unique index if not exists idx_brand_kits_one_default
  on brand_kits (workspace_id) where is_default;

alter table brand_kits enable row level security;

drop policy if exists "members_read_brand_kits" on brand_kits;
create policy "members_read_brand_kits" on brand_kits
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = brand_kits.workspace_id and m.user_id = auth.uid()
    )
  );
-- Writes go through server actions with the service role after explicit
-- membership checks; no client-side insert/update policies by design.

-- Forms remember the kit they were styled from ---------------------------------
alter table forms
  add column if not exists brand_kit_id uuid references brand_kits (id) on delete set null;

-- Creator-owned assets --------------------------------------------------------
-- kind: 'submission' (respondent upload, private) | 'brand_asset' (logo) |
--       'question_media' (illustration). Only the latter two are ever served
--       through the public asset route.
alter table uploaded_files
  add column if not exists kind text not null default 'submission',
  add column if not exists brand_kit_id uuid references brand_kits (id) on delete set null;
create index if not exists idx_files_kind on uploaded_files (kind, status);

alter table brand_kits
  add constraint brand_kits_logo_file_fk
  foreign key (logo_file_id) references uploaded_files (id) on delete set null
  not valid;

-- Platform feature flags (operator-controlled, single row) -----------------------
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
insert into platform_settings (key, value)
values (
  'flags',
  '{"registrationsEnabled":true,"uploadsEnabled":true,"upgradesEnabled":true,"aiEnabled":true,"maintenanceBanner":""}'
)
on conflict (key) do nothing;

alter table platform_settings enable row level security;
-- No policies: service-role only.

-- Notification email counter already exists on usage_monthly
-- (notification_emails); nothing to add.
