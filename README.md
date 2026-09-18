# Soyl Forms.

Typeform-style form SaaS: beautiful one-question-at-a-time forms, public links,
embeds, QR sharing, response analytics, Razorpay billing in INR, and a
super-admin console. One Next.js repository.

> Spec source of truth lives in the build pack (`docs/` in the original
> project folder). If docs conflict, priority is: `16_agent_rules` →
> `01_product_requirements` → `17_acceptance_criteria` → `architecture` →
> `04_database` → feature docs → `master prompt`.

## Status

- [x] **Phase 0 — foundation**: repo, Next.js 14 + TS strict + Tailwind,
  Supabase SSR clients, design tokens, migration `0001_init`, CI, marketing
  shell, auth pages, dashboard shell, health endpoint.
- [x] **Phase 1 — renderer**: shared one-question-at-a-time renderer
  (welcome, short/long text, single/multiple choice, yes/no, rating,
  thank-you), keyboard nav, progress, 220 ms transitions with
  `prefers-reduced-motion`, validation, logic jumps — live at `/f/demo`.
- [x] **Phase 2 — builder**: workspace auto-provisioning, dashboard list with
  create/rename/duplicate/archive, 3-pane builder (drag-and-drop outline,
  live renderer preview, per-type settings, jump rules), debounced autosave
  with revision guard, full-screen preview. Needs Supabase keys + migration
  to go live (see “Supabase setup”).
- [x] **Phase 3 — publish & responses**: immutable versioned publishes with
  plan enforcement, public `/f/[slug]` with all V1 types, idempotent
  submission endpoint with atomic monthly-limit gate + rate limits, visit
  tracking, responses list/detail with filters, workspace-authorized CSV
  export. Needs migration `0003_submit_publish.sql` to go live.
- [x] **Phase 4 — share & insight**: Share dialog (copy link, QR preview +
  PNG/SVG download, embed snippet), 14-day response chart, views/starts/
  completion-rate/avg-time cards, per-question choice + rating breakdowns.
- [x] **Phase 5 — uploads & webhooks**: private R2 uploads (presigned PUT,
  quota + MIME + size enforcement, authorized downloads, orphan cleanup),
  outgoing `form.submission.completed` webhooks (HMAC-signed, encrypted
  secrets, bounded retries via outbox worker). Needs `0005`, R2 keys,
  `WEBHOOK_ENCRYPTION_KEY`, `CRON_SECRET`.
- [x] **Design tab**: 6 theme presets + custom accent, serif/sans, pill/
  rounded buttons, response limits, close scheduling, closed message —
  all saved to drafts and frozen into published versions.
- [x] **AI dictate-to-form**: describe a form → validated editable draft in
  the builder (never auto-publishes). Credit-metered: 10 welcome + 10/month
  free, one-time Razorpay top-up packs. Needs `0006`, `AI_API_KEY`/`AI_MODEL`.
- [x] **Phase 6 — subscriptions**: server-side Razorpay subscription
  checkout, raw-body webhook with signature + `x-razorpay-event-id`
  idempotency, order-tolerant lifecycle mapping, server-truth entitlements,
  billing page with usage meters, cancel flow. Downgrades preserve all data.
  Needs Razorpay test keys + 4 plan ids + webhook secret.
- [x] **Phase 7 — super-admin**: `/super-admin` (server-verified role;
  bootstrap via `SUPER_ADMIN_EMAILS`), overview metrics incl. MRR estimate,
  user/workspace/form search, suspend-reactivate moderation, billing
  inspection, reason+expiry entitlement overrides — everything audited.
  No impersonation in V1.
- [ ] Phase 8 — hardening (E2E, Turnstile, monitoring, Cloudflare deploy)
- [ ] Phase 3 — publishing, versions, submission endpoint, responses, CSV
- [ ] Phase 4 — logic UI, QR/share panel, embed, analytics
- [ ] Phase 5 — R2 uploads, outgoing webhooks + outbox
- [ ] Phase 6 — Razorpay subscriptions + entitlement enforcement
- [ ] Phase 7 — super-admin console
- [ ] Phase 8 — hardening (E2E, rate limits, Turnstile, monitoring)

## Quick start

```bash
npm install
cp .env.example .env   # then fill Supabase keys
npm run dev            # http://localhost:3000
```

Key routes: `/` marketing · `/features` · `/pricing` · `/f/demo` live
renderer demo · `/login` · `/signup` · `/dashboard` · `/builder/[formId]`
visual builder · `/api/health`.

## Scripts

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Local dev server                          |
| `npm run typecheck` | `tsc --noEmit`                          |
| `npm run lint`    | Next.js ESLint                            |
| `npm run test`    | Vitest unit suite (`tests/`)              |
| `npm run build`   | Production build                          |
| `npm run ci`      | typecheck + lint + test + build           |

## Environment

See [.env.example](.env.example). Only `NEXT_PUBLIC_*` values ship to the
browser — service-role, Razorpay, R2, and email secrets are server-only and
the app refuses auth paths when Supabase keys are absent.

## Supabase setup

1. Create a project at <https://supabase.com> (note the current key naming in
   your project dashboard — publishable vs legacy anon key).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or
   `supabase db push` if you use the CLI). All schema changes must land as
   versioned SQL migrations — never manual dashboard edits.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   and (server only) `SUPABASE_SERVICE_ROLE_KEY`.
4. Enable email auth (and Google OAuth if wanted) per the current
   [Next.js Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/nextjs).
5. First signup creates a profile; the app provisions one personal workspace
   per user (Phase 2+ server action).

## Deployment

- **Preferred (Phase 8):** Cloudflare Workers via Cloudflare's current
  recommended Next.js path (vinext, per Aug 2026 guidance).
  `wrangler.jsonc` holds the placeholder config; keep business logic
  runtime-agnostic. Add Cloudflare Cron Triggers hitting
  `/api/cron/outbox` and `/api/cron/cleanup` with an
  `Authorization: Bearer <CRON_SECRET>` header.
- **Fallback:** any Node 18+ host (`npm run build && npm start`); run the
  two cron routes from any scheduler (cron, GitHub Actions) with the secret.
- Set production secrets in the host dashboard, never in the repo. Configure
  the live Razorpay webhook only after test-mode billing passes (Phase 6).

## Migrations (run in order, Supabase SQL editor)

1. `0001_init.sql` — all tables, indexes, RLS, plan seeds.
2. `0002_fix_forms_rls.sql` — per-command write policies + membership reads.
3. `0003_submit_publish.sql` — `publish_form` / `submit_form` RPCs (service-role only).
4. `0004_publish_fix.sql` — qualifies the ambiguous `version_number` reference.
5. `0005_uploads_index.sql` — orphan-cleanup indexes.
6. `0006_ai_credits.sql` — credit ledger + grant/spend RPCs (service-role only).
7. `0007_billing_override.sql` — manual override columns on subscriptions.

## AI providers (incl. Azure AI Foundry)

`AI_PROVIDER` selects the wire format; generation output is always a
validated, editable draft — never auto-published.

- `openai` (default): `AI_BASE_URL` + Bearer `AI_API_KEY`, `AI_MODEL` is the
  model name. Any OpenAI-compatible endpoint works.
- `azure-foundry`: Azure AI Foundry serverless inference. From the Foundry
  portal → your deployment → Target URI, e.g.
  `https://<resource>.services.ai.azure.com/models`, key from Keys/Endpoint.
  Set `AI_BASE_URL` to that URI, `AI_MODEL` to the deployment name
  (e.g. `gpt-4o`), `AI_API_KEY` to the key. Bearer auth, same JSON schema.
- `azure-openai`: classic Azure OpenAI. `AI_BASE_URL` =
  `https://<resource>.openai.azure.com`, `AI_MODEL` = deployment name,
  `AI_API_VERSION` (default `2024-10-21`); authenticates with the `api-key`
  header instead of Bearer.

## Architecture (short)

- `app/` — marketing, auth, dashboard, public renderer (`f/demo`), API routes.
- `components/renderer/` — the shared form engine. Builder preview (Phase 2)
  and public runtime reuse these components; there is one engine, not two.
- `lib/forms/` — versioned schema (Zod), conditional-logic resolver, demo content.
- `lib/plans.ts` — centralized entitlements; all limits enforced server-side.
- `supabase/migrations/` — the only way schema changes ship.
- `tests/` — unit coverage for schema validation, logic routing, entitlements.

## Decisions worth knowing

- Renderer transitions are CSS (220 ms, reduced-motion aware), not a motion
  library, to keep the public route light per agent rule 11.
- Public submissions will go through a server endpoint with rate limits,
  idempotency keys, and atomic usage enforcement — never direct anon DB
  inserts (RLS has no anon insert policy on `submissions` by design).
- Plan prices render from `lib/plans.ts` everywhere, including `/pricing`.
