-- 0006_ai_credits: credit ledger for AI form generation (future AI scope).
--
-- Called ONLY with the service role after application-layer authorization.
-- grant: race-safe monthly/welcome grants via a unique ledger key.
-- spend: atomic balance check + decrement in one UPDATE.

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
-- No policies: both tables are service-role-only by design.

-- Idempotent grant: inserts the ledger key first; only the winner tops up.
create or replace function grant_ai_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_reason text,
  p_ref text
)
returns bigint
language plpgsql
security definer
set search_path = public
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

-- Atomic spend: succeeds only when the balance covers the cost.
create or replace function spend_ai_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
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

revoke all on function grant_ai_credits(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function grant_ai_credits(uuid, bigint, text, text)
  to service_role;

revoke all on function spend_ai_credits(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function spend_ai_credits(uuid, bigint, text)
  to service_role;
