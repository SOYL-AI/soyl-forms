# SOYL Forms

Conversational one-question-at-a-time forms with **brand-aware AI drafting**:
upload a logo, a guidelines PDF or paste a website once, and every form the
AI drafts arrives in your colours, fonts and tone of voice. Public links,
QR codes, embeds, branching logic, webhooks, response analytics, Razorpay
billing in INR, and an operator console — one Next.js repository.

> Spec source of truth lives in `docs/`. If docs conflict, priority is:
> `16_agent_rules` → `01_product_requirements` → `17_acceptance_criteria` →
> `architecture` → `04_database` → feature docs → `master prompt`.
> Pricing rationale for the current release: `docs/18_pricing_review_2026-09.md`.

## What's in the box

| Area | Highlights |
| --- | --- |
| **Marketing site** | Home with a live brand-switching demo, features, pricing (monthly/yearly, CTAs carry the chosen plan into checkout), templates gallery + per-template preview, privacy/terms/contact, sitemap/robots/OG image, light + dark. |
| **Brand kit** (`/brand`) | Extracts palette, typography and voice from a logo, PDF guidelines, website URL or notes (deterministic extraction + optional AI interpretation). Contrast-checked, font allow-listed. Live preview. |
| **AI Studio** (`/create`) | Describe a form → complete draft (schema + theme + settings) in the brand kit's style, previewed as a respondent before it's saved. Credits are plan-included and only spent on success. |
| **Builder** | Outline · live preview that follows the selected question (desktop/phone) · Question, Design and Settings panels. 20 block types (grid, opinion scale, consent, time, files, question images), per-answer branching, shuffled options, "Other", auto-advance, redirects, notifications, logo + fonts + radius. |
| **Renderer** | Theme-driven CSS variables (no hard-coded surfaces), keyboard-first, answers persist across refresh, embed mode, soft one-response-per-device. |
| **Responses** | Views/completions/rate/time, 14-day chart, choice/rating/grid distributions, detail view, CSV (grids expand per row). |
| **Billing** | Razorpay subscriptions + instant checkout verification, effective-plan resolution (`lib/billing/plan.ts`), credit packs, cancel flow. |
| **Operator console** (`/super-admin`) | Overview KPIs, sign-up and response charts, plan mix, MRR/ARR, top workspaces, abuse signals; users and workspaces with detail pages; forms moderation; billing + Razorpay webhook events; usage & cost; platform feature flags; audit log. |

## Quick start

```bash
npm install
cp .env.example .env   # fill Supabase keys at minimum
npm run dev            # http://localhost:3000
```

Key routes: `/` · `/features` · `/pricing` · `/templates` · `/f/demo` ·
`/login` · `/signup` · `/dashboard` · `/create` · `/brand` ·
`/builder/[formId]` · `/forms/[formId]/responses` · `/billing` · `/super-admin`.

Requires Node 20.9+ (CI runs 22).

## Scripts

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `npm run dev`       | Local dev server                 |
| `npm run typecheck` | `tsc --noEmit`                   |
| `npm run lint`      | Next.js ESLint                   |
| `npm run test`      | Vitest unit suite (`tests/`)     |
| `npm run build`     | Production build                 |
| `npm run ci`        | typecheck + lint + test + build  |

## Environment

See [.env.example](.env.example). Only `NEXT_PUBLIC_*` values ship to the
browser. Every integration degrades honestly when its keys are missing:
auth pages render but sign-in is disabled; uploads fall back to pasted URLs;
AI Studio explains it isn't connected; billing shows preview-only plans.

### AI provider

`AI_PROVIDER` selects the wire format. Output is always a validated,
editable draft — never auto-published.

- `anthropic` (recommended): official SDK, `ANTHROPIC_API_KEY`, optional
  `AI_MODEL` (default `claude-opus-5`; `claude-sonnet-5` is the cost-efficient
  choice for drafts — see the pricing review) and `AI_EFFORT` (`low|medium|high`).
- `openai`: any OpenAI-compatible endpoint — `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- `azure-foundry` / `azure-openai`: as before (`AI_BASE_URL`, `AI_MODEL` = deployment, `AI_API_VERSION`).

### Analytics (optional)

`NEXT_PUBLIC_PLAUSIBLE_DOMAIN` or `NEXT_PUBLIC_POSTHOG_KEY` (+ host). Loaded on
marketing and signed-in pages only — never on public `/f/*` forms.

## Supabase setup

1. Create a project; set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Run the migrations below in order (SQL editor or `supabase db push`).
3. Enable email auth. For Google sign-in, enable the Google provider and add
   `https://<your-domain>/auth/callback` to the redirect allow-list.
4. Set `SUPER_ADMIN_EMAILS` to bootstrap the first operator account.

## Migrations (run in order)

1. `0001_init.sql` — all tables, indexes, RLS, plan seeds.
2. `0002_fix_forms_rls.sql` — per-command write policies + membership reads.
3. `0003_submit_publish.sql` — `publish_form` / `submit_form` RPCs.
4. `0004_publish_fix.sql` — qualifies the ambiguous `version_number` reference.
5. `0005_uploads_index.sql` — orphan-cleanup indexes.
6. `0006_ai_credits.sql` — credit ledger + grant/spend RPCs.
7. `0007_billing_override.sql` — manual override columns on subscriptions.
8. `0008_brand_kits.sql` — **new**: `brand_kits`, `forms.brand_kit_id`,
   `uploaded_files.kind` (`submission` | `brand_asset` | `question_media` | `brand_source`),
   `platform_settings` feature flags.

## Storage (Cloudflare R2)

Private bucket. Respondent uploads are served only through owner-authorised
5-minute links (`/api/files/[id]`). Creator assets — logos and question
images — are served through `/api/public/assets/[id]`, which redirects to a
1-hour signed URL and refuses anything that isn't a creator image. Brand
guideline PDFs (`brand_source`) are never served publicly; the extractor
reads them server-side.

## Deployment

- **Preferred:** Cloudflare Workers via Cloudflare's current Next.js path.
  `wrangler.jsonc` holds the placeholder config. Add Cron Triggers for
  `POST /api/cron/outbox` (webhooks + owner email notifications) and
  `POST /api/cron/cleanup` with `Authorization: Bearer <CRON_SECRET>`.
- **Fallback:** any Node 20+ host (`npm run build && npm start`) with the two
  cron routes on any scheduler.
- Configure the live Razorpay webhook (`/api/webhooks/razorpay`) only after
  test-mode billing passes.

## Architecture (short)

- `app/` — marketing, auth (`/auth/callback` for OAuth/PKCE), signed-in app,
  public renderer (`f/[slug]`), API routes, operator console.
- `components/renderer/` — the shared form engine; builder preview, AI
  Studio preview, templates and the public runtime all use it.
- `components/ui/` — small design-system primitives (tokens in `app/globals.css`).
- `lib/forms/` — versioned schema (Zod), logic resolver, theme engine
  (`themes.ts`, `color.ts`, `fonts.ts`), templates, CSV, distributions.
- `lib/brand/` — brand kit types/actions, signal extraction (PDF/URL/text/logo).
- `lib/ai/` — provider client (OpenAI-compatible, Azure, Anthropic SDK),
  draft generation, brand interpretation, credits.
- `lib/billing/plan.ts` — the one place that resolves a workspace's
  effective plan (override → entitled subscription → free).
- `lib/platform.ts` — operator feature flags read at enforcement points.
- `supabase/migrations/` — the only way schema changes ship.
- `tests/` — unit coverage for schema, answers, CSV, logic, themes/colour,
  brand extraction, AI parsing, plans, billing, migrations.

## Decisions worth knowing

- Renderer styling is entirely CSS-variable driven from `resolveTheme()`;
  text is forced to ≥4.5:1 and accent to ≥3:1 against the background, so a
  pasted brand palette can never make a form unreadable.
- Free publishes preset colours only; custom colours, logos and brand kits
  publish on Starter+. Design is never blocked — only publishing, with a
  clear upgrade prompt (that's the paid conversion moment).
- Paid entitlements come from `resolveEffectivePlan`, never from
  `plan_code` alone — a checkout that was opened but never paid grants nothing.
- AI credits are spent atomically before the provider call and refunded on
  failure; monthly grants are idempotent per workspace+month+plan.
- Public forms load no analytics, no dashboard JS, and only the two web
  fonts the theme uses.
