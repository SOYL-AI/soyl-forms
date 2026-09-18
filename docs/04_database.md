# Database Design

## 1. Principles

- PostgreSQL is the system of record.
- Every tenant-owned object has `workspace_id` where relevant.
- Form content is versioned.
- Published versions are immutable.
- Answers use JSONB for flexibility.
- Critical ownership, billing and usage data stays relational.
- Use UUIDs or sortable UUID-compatible IDs; never use predictable sequential IDs in public URLs.
- Store timestamps as `timestamptz` in UTC.

## 2. Core tables

### profiles
Extends Supabase `auth.users`.

Fields:
- `id uuid pk` references auth user
- `display_name text`
- `avatar_url text null`
- `created_at timestamptz`
- `updated_at timestamptz`

### workspaces
- `id uuid pk`
- `name text`
- `slug text unique`
- `owner_user_id uuid`
- `status enum(active,suspended,deleted)`
- `created_at`
- `updated_at`

### workspace_members
- `workspace_id uuid`
- `user_id uuid`
- `role enum(owner,admin,editor,viewer)`
- `created_at`
- composite PK `(workspace_id,user_id)`

Even though V1 may only use owner, create the structure now.

### plans
Optional DB representation of commercial plans for admin display; entitlement logic should still use a versioned server config.

Fields:
- `code text pk` (`free`, `starter`, `pro`)
- `name`
- `monthly_price_inr_paise`
- `yearly_price_inr_paise`
- `is_active`

### subscriptions
- `id uuid pk`
- `workspace_id uuid unique`
- `plan_code text`
- `provider text default 'razorpay'`
- `provider_subscription_id text unique null`
- `provider_plan_id text null`
- `billing_interval enum(monthly,yearly)`
- `status enum(free,created,authenticated,active,pending,halted,cancelled,expired)`
- `current_period_start timestamptz null`
- `current_period_end timestamptz null`
- `cancel_at_period_end boolean default false`
- `created_at`
- `updated_at`

### forms
- `id uuid pk`
- `workspace_id uuid indexed`
- `title text`
- `slug text unique indexed`
- `status enum(draft,published,closed,archived)`
- `draft_schema jsonb`
- `draft_revision bigint default 0`
- `published_version_id uuid null`
- `theme jsonb`
- `settings jsonb`
- `branding jsonb`
- `published_at timestamptz null`
- `created_by uuid`
- `created_at`
- `updated_at`

Recommended settings JSON:
```json
{
  "showProgress": true,
  "allowMultipleSubmissions": true,
  "closeAt": null,
  "submissionLimit": null,
  "closedMessage": "This form is no longer accepting responses.",
  "collectQueryParams": true
}
```

### form_versions
- `id uuid pk`
- `form_id uuid indexed`
- `version_number integer`
- `schema jsonb`
- `theme jsonb`
- `settings jsonb`
- `published_by uuid`
- `published_at timestamptz`
- unique `(form_id,version_number)`

No updates after creation except emergency metadata repair by migration/admin tooling.

### form_blocks (optional)
Do **not** create as the canonical V1 storage unless there is a measured need. The canonical builder data stays in JSONB. A denormalized analytics/indexing table can be added later.

### form_visits
For lightweight analytics.
- `id uuid pk`
- `form_id uuid`
- `form_version_id uuid`
- `session_id uuid/text`
- `source text null`
- `referer_host text null`
- `country_code text null if edge metadata available and privacy policy permits`
- `started_at timestamptz`
- `completed_at timestamptz null`
- `duration_ms bigint null`

Avoid storing raw IP indefinitely. If abuse control requires fingerprinting, store a salted rotating hash with documented retention.

### submissions
- `id uuid pk`
- `workspace_id uuid indexed`
- `form_id uuid indexed`
- `form_version_id uuid indexed`
- `idempotency_key text`
- `answers jsonb`
- `hidden_fields jsonb`
- `source text null`
- `status enum(completed,spam,deleted)`
- `duration_ms bigint null`
- `submitted_at timestamptz`
- `deleted_at timestamptz null`
- unique `(form_id,idempotency_key)`

### uploaded_files
- `id uuid pk`
- `workspace_id uuid`
- `form_id uuid null`
- `submission_id uuid null`
- `question_id text null`
- `r2_key text unique`
- `original_name text`
- `mime_type text`
- `size_bytes bigint`
- `status enum(pending,attached,deleted,quarantined)`
- `created_at`

Never trust extension alone. Validate MIME, size and allow-list.

### webhooks
- `id uuid pk`
- `workspace_id uuid`
- `form_id uuid`
- `url text`
- `secret_encrypted text`
- `is_active boolean`
- `events text[]`
- `created_at`
- `updated_at`

### webhook_deliveries
- `id uuid pk`
- `webhook_id uuid`
- `event_type text`
- `event_id uuid`
- `attempt integer`
- `http_status integer null`
- `next_attempt_at timestamptz null`
- `delivered_at timestamptz null`
- `last_error text null`

### outbox_events
- `id uuid pk`
- `workspace_id uuid null`
- `type text`
- `payload jsonb`
- `status enum(pending,processing,completed,failed)`
- `attempts integer`
- `available_at timestamptz`
- `created_at`
- `processed_at timestamptz null`

### usage_monthly
- `workspace_id uuid`
- `month date` (first day of month)
- `completed_submissions bigint`
- `file_storage_bytes bigint`
- `notification_emails bigint`
- `webhook_attempts bigint`
- `updated_at`
- composite PK `(workspace_id,month)`

File storage may also be maintained as a workspace-level total for fast enforcement.

### razorpay_webhook_events
- `event_id text pk` from `x-razorpay-event-id`
- `event_type text`
- `received_at timestamptz`
- `processed_at timestamptz null`
- `payload_hash text`
- `status text`

Use for webhook idempotency.

### admin_users
Prefer environment/config allow-list or a dedicated secure role mapping, not a client-editable field on profiles.

Possible table:
- `user_id uuid pk`
- `role enum(super_admin,support_admin)`
- `created_by uuid`
- `created_at`

### audit_logs
- `id uuid pk`
- `actor_user_id uuid null`
- `actor_type text`
- `workspace_id uuid null`
- `action text`
- `target_type text`
- `target_id text null`
- `metadata jsonb`
- `ip_hash text null`
- `created_at`

## 3. Form JSON schema

Use an explicit schema version.

Example:
```json
{
  "schemaVersion": 1,
  "title": "Customer Discovery",
  "blocks": [
    {
      "id": "blk_welcome",
      "type": "welcome",
      "title": "A few quick questions",
      "description": "Takes about 2 minutes",
      "buttonLabel": "Start"
    },
    {
      "id": "q_name",
      "type": "short_text",
      "title": "What should we call you?",
      "required": true,
      "validation": {"maxLength": 100}
    },
    {
      "id": "q_role",
      "type": "single_choice",
      "title": "What best describes you?",
      "required": true,
      "options": [
        {"id":"opt_founder","label":"Founder"},
        {"id":"opt_student","label":"Student"}
      ]
    },
    {
      "id": "blk_thanks",
      "type": "thank_you",
      "title": "Thanks!",
      "description": "Your response has been recorded."
    }
  ],
  "logic": [
    {
      "id": "rule_1",
      "when": {
        "questionId": "q_role",
        "operator": "equals",
        "value": "opt_student"
      },
      "then": {"action":"goto","blockId":"q_college"}
    }
  ]
}
```

Question IDs must remain stable across edits unless the question is deliberately replaced. Never key answer data by array position.

## 4. Answer JSON conventions

Answers map question IDs to typed values:

```json
{
  "q_name": {"type":"short_text","value":"Ryan"},
  "q_role": {"type":"single_choice","value":"opt_founder"},
  "q_rating": {"type":"rating","value":5},
  "q_files": {"type":"file_upload","value":["file_uuid_1"]}
}
```

This preserves enough typing context for exports and future migrations.

## 5. Indexing

Create indexes for common access paths:
- forms(workspace_id, updated_at desc)
- forms(slug)
- submissions(form_id, submitted_at desc)
- submissions(workspace_id, submitted_at desc)
- form_versions(form_id, version_number desc)
- form_visits(form_id, started_at desc)
- subscriptions(provider_subscription_id)
- usage_monthly(workspace_id, month)
- outbox_events(status, available_at)

Add GIN indexes to JSONB only after a real query needs them.

## 6. RLS

Representative policies:
- members can select forms where they belong to the form workspace
- editors/owners can mutate forms
- only owners/admins can view billing
- public respondents do not get direct insert permission to `submissions` through anonymous Supabase client; use a server-controlled submission endpoint
- service-role usage is server-only

## 7. Data retention

V1:
- soft delete forms/submissions where practical
- allow user to permanently delete form data through explicit confirmation
- deleted R2 objects must be cleaned asynchronously
- audit logs should not copy sensitive answer payloads

## 8. Database migrations

All schema changes must be represented as version-controlled SQL migrations under `supabase/migrations`. The AI agent must never rely on undocumented manual dashboard-only changes.
