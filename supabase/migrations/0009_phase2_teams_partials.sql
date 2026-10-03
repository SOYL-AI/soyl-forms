-- 0009_phase2_teams_partials: team invites, response tags/edits, visit
-- progress, and save-and-resume for partial responses.
--
-- Conventions: service role does all app writes (RLS below covers user-owned
-- clients only); every INSERT policy carries WITH CHECK.

-- Workspace invites ---------------------------------------------------------
create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  email text not null,
  role member_role not null default 'viewer',
  token text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index if not exists idx_invites_workspace on workspace_invites (workspace_id, created_at desc);
create index if not exists idx_invites_token on workspace_invites (token);

alter table workspace_invites enable row level security;

-- Owners/admins can see pending invites from a user-owned client; all writes
-- go through the server (service role) so invites can't be forged.
create policy "admins_read_invites" on workspace_invites
  for select using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = workspace_invites.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Response tags + edit marker ------------------------------------------------
alter table submissions add column if not exists tags text[] not null default '{}';
alter table submissions add column if not exists edited_at timestamptz;

-- Visit progress (drop-off funnel) -------------------------------------------
alter table form_visits add column if not exists last_block_id text;
alter table form_visits add column if not exists progress_at timestamptz;

-- Partial responses (save-and-resume links) ----------------------------------
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

-- No direct client access: respondents save/resume only via the public
-- endpoint (service role), which validates answers before storing.
