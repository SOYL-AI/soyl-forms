-- 0007_billing_override: manual entitlement overrides (super-admin).
alter table subscriptions
  add column if not exists override_reason text,
  add column if not exists override_expires_at timestamptz;
