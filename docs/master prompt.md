# MASTER PROMPT — Build the Typeform-Style Form SaaS

You are the lead full-stack engineer responsible for building this project end-to-end as a production-quality SaaS.

Before writing code, read every specification file in this build pack. The detailed docs are the source of truth. If anything conflicts, follow the priority order in `00_README.md`.

## Mission

Build a beautiful, affordable, Typeform-style form platform with:

1. A polished public marketing website.
2. Authentication and a customer dashboard.
3. A visual form builder.
4. A one-question-at-a-time respondent experience with excellent UX.
5. Public links, embeds and built-in QR code generation.
6. Response collection, simple analytics and CSV export.
7. Conditional logic.
8. File uploads.
9. Outgoing submission webhooks.
10. Razorpay subscription billing in INR.
11. A secure platform super-admin console.
12. A scalable versioned PostgreSQL data model.
13. A future-ready form schema so AI can later generate forms from text/voice.

This is a real application, not a mockup. Do not fake data or leave key buttons non-functional.

## Product philosophy

The public form experience is the hero feature. It must feel exceptionally smooth and focused.

Do not clone Typeform branding or exact visuals. Recreate the interaction principles:
- one major question per screen
- excellent typography
- fast keyboard navigation
- subtle animation
- minimal distraction
- strong mobile experience

The platform should be simple enough for personal/internal use but structured correctly enough to sell.

## Required stack

Use one repository.

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui for dashboard/admin primitives
- Motion for respondent transitions
- dnd-kit for builder reordering
- Zod for runtime/server validation
- Supabase Auth
- Supabase PostgreSQL
- Supabase RLS where applicable
- Cloudflare Workers as preferred production runtime using the current Cloudflare-recommended Next.js deployment path
- Cloudflare R2 private object storage
- Cloudflare Turnstile/rate limiting as appropriate
- Razorpay Subscriptions
- Resend or equivalent transactional email
- Playwright for critical E2E tests
- error monitoring in production

Use current stable compatible package versions and official provider documentation. Pin dependencies.

Do NOT introduce NestJS, microservices, Redis, Kafka or a separate backend unless a concrete requirement cannot be satisfied without them.

## Product plans

Implement centralized entitlements.

FREE
- ₹0
- 2 active forms
- 250 completed submissions/month
- 25 MB uploads
- platform branding
- QR included
- CSV export
- basic logic

STARTER
- ₹199/month or ₹1,990/year
- 15 active forms
- 5,000 completed submissions/month
- 1 GB uploads
- remove branding
- custom logo/themes
- notifications
- multiple outgoing webhooks
- advanced logic

PRO
- ₹499/month or ₹4,990/year
- up to 100 active forms under fair use
- 25,000 completed submissions/month
- 10 GB uploads
- everything in Starter
- advanced analytics
- longer version history
- custom domain capability when implemented
- higher webhook/email allowances
- future AI beta entitlement

All enforcement is server-side. Frontend gating is convenience only.

## Architecture constraints

Use a default personal workspace even if team collaboration is not exposed yet.

Data model must include:
- profiles
- workspaces
- workspace_members
- subscriptions
- forms
- form_versions
- form_visits
- submissions
- uploaded_files
- webhooks
- webhook_deliveries
- usage_monthly
- outbox_events
- razorpay_webhook_events
- admin role mapping
- audit_logs

Forms have mutable `draft_schema` JSONB and immutable published `form_versions` JSONB.

Every submission references the exact published form version it answered.

Never key answers by question array index; use stable block/question IDs.

## Form schema

Define a strongly typed, versioned `FormSchemaV1` discriminated union for blocks.

Required block types:
- welcome
- short_text
- long_text
- email
- number
- phone
- url
- single_choice
- multiple_choice
- dropdown
- yes_no
- rating
- opinion_scale
- date
- file_upload
- statement
- thank_you

Include typed validation per block.

Define conditional logic as validated data, not arbitrary code.

Add logic graph validation to prevent missing targets and obvious infinite loops.

## Builder

Desktop builder should generally use:
- left block outline
- center live preview
- right selected-block properties
- top bar with back, name, save state, preview, publish

Requirements:
- add block
- reorder
- duplicate
- delete
- edit
- autosave
- theme
- settings
- logic
- full-screen preview

The live preview and public renderer must reuse the same underlying form renderer/block components.

## Respondent experience

Build public form route such as `/f/[slug]`.

Requirements:
- one main block at a time
- smooth 180–300 ms transitions
- keyboard navigation
- Shift+Enter newline where appropriate
- preserve answers when moving back
- strong mobile keyboard behavior
- clear validation
- progress
- accessible focus behavior
- `prefers-reduced-motion`
- network retry without losing answers
- idempotent final submission

Do not ship dashboard/admin code to this route unnecessarily.

## Publishing/versioning

Publish must:
1. validate schema client-side
2. validate server-side
3. enforce form entitlement
4. create immutable form version
5. update active published version pointer
6. return canonical public URL

Republishing never rewrites historical versions.

## QR

Every published form has built-in QR sharing.

QR destination:
`{PUBLIC_URL}/f/{slug}?src=qr`

Share UI:
- copy link
- QR preview
- download PNG
- download SVG if supported
- embed snippet

QR is available to free users.

## Submissions

Submission endpoint must:
- validate rate limits
- validate form open state
- validate answer types against exact form version
- enforce response plan limit atomically
- accept idempotency key
- prevent duplicate rows on retry
- attach only valid uploaded file references
- insert submission and usage update safely
- produce outbox event for outgoing webhook/email

Do not directly grant anonymous clients broad DB insert privileges.

## Responses and analytics

Customer response UI:
- response list/table
- individual response detail
- date filter
- simple search where practical
- CSV export

Analytics V1:
- views
- starts
- completions
- completion rate
- completion duration
- submissions over time
- simple choice/rating distribution

## File uploads

Use private R2.

Enforce:
- MIME/type allow-list
- file size
- plan storage limit
- randomized object keys
- authorized downloads via signed/protected access
- orphan cleanup

Do not store sensitive respondent names/emails in object keys.

## Outgoing webhooks

Creator may configure a webhook for completed submission.

Sign payload using per-webhook secret with HMAC SHA-256.

Persist delivery attempts and implement bounded retry/outbox behavior.

## Razorpay

Use Razorpay Subscriptions for paid monthly/yearly plans.

Provider plan IDs come only from trusted server configuration.

Create checkout/subscription server-side.

Webhook endpoint must:
- operate on raw request body
- verify Razorpay signature
- deduplicate using `x-razorpay-event-id`
- tolerate duplicate and out-of-order events
- persist event processing state

Do not permanently enable paid plan based only on frontend checkout callback.

Implement test mode completely before live mode.

## Super-admin

Build `/super-admin` protected by server-verified admin role.

Required views:
- platform overview metrics
- users
- workspaces
- forms
- subscriptions/billing
- usage/storage
- abuse/moderation
- audit log

Required actions:
- search by relevant IDs/email
- suspend/reactivate workspace
- suspend/reactivate public form
- inspect billing provider IDs/status
- manual entitlement override only if explicit reason + expiry + audit record

Do not build silent impersonation in V1.

## Security

Required:
- Supabase SSR auth according to current official guidance
- RLS on tenant data exposed through Supabase APIs
- server-side workspace authorization
- private files
- no raw HTML/JavaScript form content
- input length limits
- rate limiting
- Turnstile where appropriate
- safe security headers
- no answer payloads in ordinary logs
- no server secrets in browser bundle

Cross-tenant access tests are mandatory.

## Marketing site

Build a polished website around the product, including:
- hero with interactive mini form
- feature section
- QR sharing feature
- builder/runtime screenshots or live components
- pricing in INR
- FAQs
- CTA

Avoid unsupported competitive claims. It is fine to say "simple INR pricing" or "built to be affordable"; do not claim absolute cheapest without current evidence.

## Implementation order

Follow `14_roadmap.md`.

Especially:
1. foundation
2. beautiful hardcoded renderer
3. builder
4. persistence/publishing/submissions
5. QR/logic/share
6. uploads/webhooks
7. billing
8. super-admin
9. hardening

Do not start with billing before the core form experience works.

## Quality gates

At the end of every phase:
- typecheck
- lint
- tests
- production build
- list migrations
- list environment variables added
- state known issues

Never report a phase complete if critical acceptance criteria fail.

## Deliverables

The finished repository must include:
- working application
- SQL migrations
- `.env.example`
- seed/demo script for local development only
- README with setup/deploy instructions
- test suite
- documented Razorpay webhook setup
- documented Cloudflare/R2 setup
- documented Supabase setup

Start by summarizing the architecture you are about to implement and creating an implementation checklist mapped to the build-pack documents. Then implement Phase 0 and Phase 1. Continue phase-by-phase, validating each phase before moving on.
