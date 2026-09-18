# Typeform-Style Form SaaS — AI Agent Build Pack

This folder is the source-of-truth specification for building a polished, low-cost, Typeform-style form SaaS with an India-first INR pricing model, Razorpay subscriptions, public form links, embeddable forms, QR sharing, a customer dashboard, and a separate platform super-admin.

## Working principle

Build a **small, coherent, production-ready V1** rather than a broad clone of every form product. The core product promise is simple:

> A person can create a beautiful one-question-at-a-time form, publish it, share a URL or QR code, receive submissions, and review/export responses.

The filling experience should feel closer to a focused interactive app than a traditional web form.

## Documents

1. `01_product_requirements.md` — product scope, personas, plans and acceptance criteria.
2. `architecture.md` — full technical architecture and major design decisions.
3. `flow.md` — end-to-end user, respondent, billing and admin flows.
4. `04_database.md` — relational schema, JSON form schema, tenancy and indexing.
5. `05_frontend_ux.md` — design language, builder UX and Typeform-style runtime rules.
6. `06_super_admin.md` — global platform administration requirements.
7. `07_api_backend.md` — route handlers, server actions, jobs, webhooks and API contracts.
8. `08_auth_security.md` — authentication, authorization, RLS, abuse protection and secrets.
9. `09_razorpay_billing.md` — subscriptions, webhook handling, plan enforcement and billing UX.
10. `10_qr_sharing_embed.md` — QR generation, share links, embeds and social metadata.
11. `11_deployment_infra.md` — Cloudflare + Supabase + R2 + email infrastructure.
12. `12_pricing_unit_economics.md` — recommended INR plans and cost logic.
13. `13_testing_qa.md` — test strategy, critical cases and launch checklist.
14. `14_roadmap.md` — phased implementation sequence.
15. `15_future_ai.md` — future voice/text-to-form generation architecture.
16. `16_agent_rules.md` — non-negotiable coding-agent rules.
17. `17_acceptance_criteria.md` — precise V1 definition of done.
18. `master prompt.md` — master instruction to paste into the coding agent.
19. `.env.example` — required configuration surface.

## Source-of-truth priority

If documents conflict, use this order:

1. `16_agent_rules.md`
2. `01_product_requirements.md`
3. `17_acceptance_criteria.md`
4. `architecture.md`
5. `04_database.md`
6. feature-specific documents
7. `master prompt.md`

The master prompt coordinates the work; the detailed documents define the implementation.

## V1 stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Motion for transitions
- Supabase Auth + PostgreSQL
- Cloudflare Workers for the application runtime
- Cloudflare R2 for user file uploads
- Cloudflare Turnstile for anti-bot protection where appropriate
- Resend or equivalent transactional email provider
- Razorpay Subscriptions for paid plans
- Sentry or equivalent error monitoring when production traffic starts

Use the latest stable compatible package versions at implementation time. Pin exact versions in the lockfile; do not leave floating dependencies.

## Product boundaries for V1

V1 includes the marketing site, authentication, customer dashboard, builder, live form renderer, submissions, CSV export, QR sharing, webhooks, billing, usage enforcement, and platform super-admin.

V1 intentionally excludes AI form generation, advanced team collaboration, native mobile apps, Salesforce/HubSpot integrations, complex enterprise SSO, HIPAA-specific compliance, and a marketplace.
