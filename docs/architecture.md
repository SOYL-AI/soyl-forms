# Architecture

## 1. Architecture goals

Prioritize:
- low fixed monthly cost
- one repository
- simple deployment
- strict tenant isolation
- versioned form definitions
- easy feature expansion
- safe public submission endpoints
- predictable billing enforcement
- minimal operational burden

Avoid premature microservices.

## 2. High-level architecture

```text
Browser
  |
  v
Cloudflare Edge / Workers
  |
  +--> Next.js application
  |      +--> Marketing website
  |      +--> Authenticated dashboard
  |      +--> Form builder
  |      +--> Public form renderer
  |      +--> API/route handlers
  |      +--> Super-admin
  |
  +--> Cloudflare Turnstile / rate controls
  |
  +--> Supabase
  |      +--> Auth
  |      +--> PostgreSQL
  |      +--> RLS policies
  |
  +--> Cloudflare R2 (uploads)
  |
  +--> Razorpay (subscriptions)
  |
  +--> Resend/email provider
  |
  +--> Sentry/observability (production)
```

## 3. Application architecture

Use a single Next.js App Router codebase. Do not create a separate NestJS backend for V1.

Suggested repository shape:

```text
/
├─ app/
│  ├─ (marketing)/
│  ├─ (auth)/
│  ├─ dashboard/
│  ├─ builder/[formId]/
│  ├─ forms/[formId]/responses/
│  ├─ f/[slug]/
│  ├─ super-admin/
│  └─ api/
├─ components/
│  ├─ ui/
│  ├─ builder/
│  ├─ renderer/
│  ├─ dashboard/
│  └─ admin/
├─ lib/
│  ├─ supabase/
│  ├─ auth/
│  ├─ billing/
│  ├─ plans/
│  ├─ forms/
│  ├─ validation/
│  ├─ security/
│  ├─ qr/
│  └─ analytics/
├─ types/
├─ supabase/
│  └─ migrations/
├─ tests/
├─ public/
├─ wrangler.jsonc
└─ package.json
```

If a monorepo package split becomes valuable later, extract renderer/schema packages only after the app is working. V1 should not spend time on package choreography.

## 4. Runtime and deployment

Target Cloudflare Workers for low-cost hosting. As of the 2026 Cloudflare guidance, new Next.js deployments should use Cloudflare's recommended current Next.js path (currently vinext). Keep standard Next.js development behavior locally and avoid Cloudflare-specific business logic.

Provide a documented fallback to a conventional Node deployment if an unsupported feature appears. Do not change data architecture merely to accommodate the hosting provider.

## 5. Data model strategy

Use a hybrid model:

### Relational data
Keep ownership, workspaces, forms, publishes, subscriptions, submissions, file references, webhooks and usage counters in normalized PostgreSQL tables.

### JSONB form definition
Store each immutable published form version as a JSONB schema. This avoids a complex table-per-question-type model and lets new question types evolve safely.

### Submission answers
Store the canonical answer payload in JSONB, while also keeping high-value searchable metadata relationally (submission ID, form ID, form version ID, timestamps, status, duration, source, respondent fingerprint hash where allowed).

Do not rely on JSONB alone for tenant ownership, billing or access control.

## 6. Form lifecycle

A form has:
- mutable draft definition
- zero or more immutable published versions
- a pointer to the currently active published version

When the creator publishes:
1. validate draft schema
2. create new `form_versions` row
3. compute version number
4. point form `published_version_id` to new version
5. update `published_at`

Existing submissions always point to the form version they were rendered from.

## 7. Draft saving

Use debounced autosave with optimistic UI.

Rules:
- local UI state updates immediately
- debounce server persistence ~500–1000 ms after edits
- show Saving/Saved/Error state
- do not create a new immutable version for every keystroke
- publish creates the immutable version
- use an incrementing draft revision or `updated_at` conflict check to avoid silent overwrites

## 8. Public form delivery

The public renderer should receive only the minimum published definition needed to render.

Do not expose:
- owner IDs unless required
- internal billing data
- service keys
- admin notes
- unpublished draft fields

Cache safe public form metadata at the edge where possible, but never cache authenticated dashboard responses across users.

## 9. Submission pipeline

```text
Respondent loads form
  -> create anonymous form session/event (optional lightweight analytics)
  -> user answers locally
  -> optionally autosave partial state only if feature enabled later
  -> final submit
  -> validate published version + answers server-side
  -> check form open/limits/rate-limit
  -> create submission transaction
  -> update usage counters atomically
  -> enqueue/dispatch outgoing webhook + email notification
  -> return success screen data
```

A client-side success animation is not proof of persistence. The server must return a durable submission ID.

## 10. Async work

V1 can do short post-submit work using platform-supported background execution where safe, but external webhooks/email must be failure-tolerant.

Create an `outbox_events` table if direct post-request dispatch becomes unreliable. Recommended reliable pattern:
- transaction inserts submission + outbox event
- worker/cron processes outbox
- retry with exponential backoff
- mark delivered/failed

This pattern is strongly recommended before meaningful production usage.

## 11. Multi-tenancy

Every creator-owned object belongs to a workspace, even if V1 gives each user one default personal workspace.

Why:
- avoids painful migration when teams arrive
- keeps authorization consistent
- billing attaches naturally to workspace

V1 rule:
- signup creates one personal workspace
- user is owner
- forms belong to workspace
- subscription belongs to workspace

## 12. Authorization layers

Use both:
1. application-layer authorization
2. PostgreSQL Row Level Security where data is accessible via Supabase client/data APIs

Never trust a workspace ID from the browser without verifying membership.

## 13. Plan enforcement

A centralized `plan entitlements` module defines:
- active form limit
- monthly submission limit
- file storage limit
- branding removal
- advanced logic permission
- custom domain permission
- analytics tier
- webhook count

Server checks are authoritative. Frontend checks are UX only.

## 14. Scalability path

Scale in this order:
1. add DB indexes and optimize queries
2. maintain monthly usage counters rather than repeatedly counting large submission sets
3. move notifications/webhooks to outbox processing
4. enable connection pooling and tune DB compute
5. edge-cache published form definitions
6. partition submissions only when data volume truly justifies it
7. split services only if independent scaling becomes necessary

Do not design for billions of responses before proving thousands.
