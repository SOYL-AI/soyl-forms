# Implementation Roadmap

## Phase 0 — foundation

Deliver:
- repository
- Next.js/TypeScript/Tailwind
- Cloudflare-compatible deployment config
- Supabase clients/auth
- base design system
- migrations framework
- CI checks

Exit condition: marketing shell and authenticated dashboard deploy successfully.

## Phase 1 — renderer first

Build the fun/core part before billing complexity.

Deliver:
- hardcoded JSON form schema
- one-question-at-a-time renderer
- short text
- long text
- single choice
- multiple choice
- yes/no
- rating
- welcome/thank-you
- keyboard navigation
- progress
- transitions
- mobile UX

Exit: `/f/demo` feels polished.

## Phase 2 — builder

Deliver:
- form dashboard
- create form
- builder 3-pane UI
- add/edit/delete/reorder blocks
- live preview shares renderer components
- draft autosave
- schema validation

Exit: user can create a complete form definition without touching JSON.

## Phase 3 — publish and responses

Deliver:
- publish versioning
- public slug
- remaining V1 question types
- server submission endpoint
- response list/detail
- CSV export
- monthly usage counts

Exit: end-to-end create → publish → submit → view response works.

## Phase 4 — logic, QR and sharing

Deliver:
- conditional jumps
- validation for logic graph
- share modal
- QR PNG/SVG
- embed mode/snippet
- basic visit/completion analytics

Exit: forms are practically distributable.

## Phase 5 — uploads and webhooks

Deliver:
- R2 upload flow
- file answer type
- protected downloads
- outgoing submission webhooks
- retries/outbox

Exit: lead/application use cases are usable.

## Phase 6 — billing

Deliver:
- plan definitions
- usage page
- Razorpay test-mode subscriptions
- webhook verification/idempotency
- server entitlement checks
- monthly/yearly upgrade
- cancellation/downgrade behavior

Exit: paid plan can be sold safely.

## Phase 7 — super-admin

Deliver:
- global metrics
- user/workspace search
- form moderation
- subscription inspection
- usage/storage view
- audit logs

Exit: operator can manage the SaaS without database poking for normal incidents.

## Phase 8 — hardening

Deliver:
- E2E suite
- rate limits/Turnstile policies
- security headers
- monitoring
- responsive polish
- accessibility pass
- production migrations and backup plan

## Post-launch

Candidate order:
1. templates
2. partial submissions
3. custom domains
4. richer analytics/drop-off
5. team members
6. Google Sheets/Notion integrations
7. AI/voice form generation
8. adaptive AI forms
