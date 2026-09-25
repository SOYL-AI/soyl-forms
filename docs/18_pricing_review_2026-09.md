# Pricing & Margin Review — September 2026

Written alongside the brand-aware AI launch. The plan prices in `lib/plans.ts`
(₹0 / ₹199 / ₹499) were left unchanged; this document argues what to do
next and what margins to expect. Prices for third-party services are the
public list prices at the time of writing — re-check before acting.

## 1. Where the money goes (per paying workspace, per month)

| Cost line | Assumption | Starter (₹199) | Pro (₹499) |
| --- | --- | ---: | ---: |
| Razorpay fee | ~2% + 18% GST on the fee ≈ 2.36% | ₹4.70 | ₹11.78 |
| Database / auth | Supabase Pro US$25/mo shared across all workspaces; ~₹2,100/mo fixed | ~₹15 at 150 paying customers | ~₹15 |
| File storage (R2) | US$0.015/GB-month; assume 20% of quota used | ₹0.25 (1 GB × 20%) | ₹2.50 (10 GB × 20%) |
| Email (Resend) | 3,000 free/mo then ~US$20 per 50k; assume 200 emails/workspace | ≈ ₹0 early, ~₹7 at scale | ~₹15 |
| Webhooks, CDN, compute | Cloudflare Workers; negligible per workspace at V1 volumes | ~₹2 | ~₹4 |
| **AI credits (new)** | see §2; 40 credits Starter / 150 Pro *if fully used* | ₹40–120 | ₹150–450 |
| Support time | 15 min/customer/month at ₹400/hr blended | ₹100 | ₹100 |

Two things stand out:

1. **Without AI, gross margin is ~85–90%** on both tiers (₹199 → ~₹175
   contribution before support; ₹499 → ~₹450). That matches the original
   economics doc and is healthy.
2. **AI is the only line that can eat the margin.** A workspace that burns
   its whole monthly allowance on a frontier model turns Starter from
   ~₹175 to ~₹55–135 of contribution. It is still positive, but it is the
   variable you must meter — which is why credits stay a hard, server-side
   ledger rather than "unlimited AI".

## 2. What one AI credit actually costs

Measured shape of the prompts shipped in this release:

- **Form draft**: ~2.5k input tokens (system prompt + brand kit + description) → ~2–3k output tokens (JSON schema + theme).
- **Brand extraction**: ~6–14k input tokens (PDF text + website copy + colour evidence) → ~0.6k output.

Claude list prices (per 1M tokens, input/output): Opus 5 $5/$25 · Sonnet 5 $2/$10 · Haiku 4.5 $1/$5. At ₹84/US$:

| Operation | Opus 5 | Sonnet 5 | Haiku 4.5 |
| --- | ---: | ---: | ---: |
| One draft (1 credit) | ≈ ₹7.5 | ≈ ₹3.0 | ≈ ₹1.5 |
| One brand extraction (2 credits) | ≈ ₹5.5 | ≈ ₹2.2 | ≈ ₹1.1 |

Credit packs currently sell at **₹0.98 (50), ₹0.75 (200) and ₹0.50 (1,000)
per credit**. Against Opus 5 that is a loss on every pack; against Sonnet 5
the 50-pack roughly breaks even and the 1,000-pack loses ~₹2.50 per credit.

### Recommendation

- **Run drafts on Sonnet 5 by default** (`AI_MODEL=claude-sonnet-5`) and
  reserve Opus 5 for brand extraction, where judgement about tone and
  colour evidence matters more and the call happens once per brand rather
  than per form. Quality of a 10-question form schema does not need Opus.
- **Re-price credit packs to ₹2–₹3 per credit**: 50 for ₹149, 200 for
  ₹499, 1,000 for ₹1,999. This is still cheap in absolute terms (a full
  branded form for the price of a coffee) and keeps ~50–60% margin on the
  worst-case model mix.
- Keep the **included monthly credits** (10/40/150). They are the
  acquisition hook; at Sonnet prices the fully-used allowance costs
  ₹30 (Free), ₹120 (Starter), ₹450 (Pro) — real money on Free, which is
  fine as CAC, and comfortably inside the paid tiers' gross margin because
  average utilisation will be well under 100%.
- Add the refund-on-failure behaviour that ships in this release to the
  terms ("credits are only spent when a draft is produced") — it is a
  trust point competitors rarely state.

## 3. Are ₹199 and ₹499 still right?

Yes for launch, with one caveat. The market reference in
`12_pricing_unit_economics.md` (Typeform ~US$29, Tally ~US$24, Jotform ~US$34)
still holds, so ₹199 (~US$2.40) and ₹499 (~US$6) are an order of magnitude
below the incumbents while offering a differentiator none of them have as a
first-class object (brand kits driving AI generation). Do not raise the
entry price; the Indian creator/student/SMB segment is price-anchored on
UPI-sized amounts.

The caveat: **the brand-kit feature is worth more to companies than to
individuals**, and companies are under-charged at ₹499. Introduce a
**Business tier at ₹1,499/month (₹14,990/yr)** once these exist (all are
small increments on what shipped today):

- team seats (the `workspace_members` model already supports roles),
- unlimited brand kits and a shared kit library,
- custom domain for public forms,
- 100k responses/month, 50 GB storage, 500 AI credits,
- priority support / SLA wording.

Expected mix in year one: ~85% Free, ~11% Starter, ~3.5% Pro, ~0.5%
Business. Blended ARPU across paying workspaces ≈ ₹310/month.

## 4. Margin targets

| Stage | Paying workspaces | Fixed infra | Blended gross margin | Note |
| --- | ---: | ---: | ---: | --- |
| Launch | 0–50 | ₹3–4k/mo | 45–60% | Fixed costs dominate; Free-tier AI is CAC |
| Traction | 150–300 | ₹6–8k/mo | 75–80% | Supabase Pro + Resend paid tier kick in |
| Scale | 1,000+ | ₹20–30k/mo | 82–88% | Support becomes the largest variable cost |

The realistic long-run target for a form SaaS at these prices is **~85%
gross margin, ~70% after support**. If AI utilisation trends above ~60% of
included credits, either move drafts to Haiku 4.5 or trim included credits
before touching plan prices.

## 5. Break-even sanity check

At ₹6k/month of fixed tooling (traction stage) and ₹310 blended ARPU with
~80% gross margin, break-even on infrastructure is **~25 paying
workspaces**. Every 100 Free workspaces cost roughly ₹500–1,500/month in AI
if they use their credits, so watch the Free→paid conversion rate: below
~4% the Free tier's AI allowance should drop from 10 to 5 credits.

## 6. Things not to do

- Don't make AI "unlimited" on any tier — it is the only unbounded cost.
- Don't introduce ₹49/₹99 tiers — support load per rupee is terrible.
- Don't discount yearly beyond ~2 months free; the cash-flow benefit is
  real but the Indian SMB market churns on yearly plans when the business
  itself changes.
- Don't charge for QR codes, logic or exports — they are the reasons
  people leave Google Forms in the first place.
