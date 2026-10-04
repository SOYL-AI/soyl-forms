-- 0011_mcp_api_keys: per-workspace API keys for the MCP server.
--
-- External agents authenticate as `Authorization: Bearer <secret>`.
-- Only the SHA-256 hash is stored; the secret itself is shown once at
-- mint time and never persisted. RLS is enabled with NO policies: even
-- workspace members must not read hashes — all access goes through the
-- service role after explicit verification in the /api/mcp route.

create table if not exists workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null default 'mcp',
  key_prefix text not null,
  key_hash text not null,
  created_by uuid references auth.users (id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_api_keys_hash on workspace_api_keys (key_hash);
create index if not exists idx_api_keys_workspace on workspace_api_keys (workspace_id, created_at desc);

alter table workspace_api_keys enable row level security;
-- No policies by design: service role only (see header comment).
