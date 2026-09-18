# Pricing and Unit Economics

## 1. Pricing objective

Be dramatically cheaper than mainstream paid form builders without creating a model where one heavy user can consume unbounded storage/email/support.

Do not market the product as "the cheapest form builder on earth" because some competitors have unusually generous free tiers. Instead position paid plans as straightforward INR pricing and strong value.

## 2. Market reference snapshot — September 2026

Current public references used while preparing this pack:
- Typeform Basic: about US$29/month monthly pricing; higher tiers significantly more.
- Tally Pro: about US$24/month on the pricing page at the time checked (its help pages may show US$29 monthly depending billing/page context); Tally has a very generous free tier.
- Jotform Bronze: about US$34/month billed annually, with lower form/submission limits than higher tiers.

Competitor pricing changes frequently. Re-check before publishing comparative marketing claims.

## 3. Recommended launch plans

### Free — ₹0
- 2 active forms
- 250 completed submissions/month
- 25 MB upload storage
- platform branding
- QR code
- basic logic
- CSV export

Purpose: meaningful product trial and personal/internal use without creating large infrastructure exposure.

### Starter — ₹199/month
Annual: ₹1,990
- 15 active forms
- 5,000 submissions/month
- 1 GB upload storage
- remove branding
- custom logo/theme
- email notifications
- multiple webhooks
- advanced logic

### Pro — ₹499/month
Annual: ₹4,990
- up to 100 active forms under fair use
- 25,000 submissions/month
- 10 GB upload storage
- advanced analytics
- custom domain when implemented
- longer form version history
- higher webhook/email limits
- future AI beta access

### Business — later
₹999–₹1,499/month should be evaluated only once team/support/compliance features exist.

## 4. Why these prices

₹199 is low-friction for Indian students, freelancers and small teams while still leaving room above payment and infrastructure cost.

₹499 is materially below the mainstream US$20–$30+ form-builder price range while allowing meaningful usage.

Avoid ₹49/₹99 paid tiers: payment/support overhead and perceived value become awkward, and ultra-low pricing attracts high-support low-value accounts.

## 5. Razorpay payment cost planning

A common standard domestic headline is ~2% platform fee plus GST on that fee, approximately 2.36% effective on a normal transaction. Actual merchant terms can differ.

Illustrative per-charge payment processing cost:
- ₹199 plan: ~₹4.70
- ₹499 plan: ~₹11.78
- ₹999 plan: ~₹23.58

This leaves ~97.6% before infrastructure/tax/support under that simple assumption.

## 6. Data cost intuition

Text answers are cheap. The expensive variables are more likely:
- PostgreSQL compute/IO as usage grows
- file uploads
- email volume
- outbound webhook attempts
- support time

If a completed text response averages 5 KB of raw answer/metadata payload:
- 5,000 responses ≈ 25 MB raw
- 25,000 responses ≈ 125 MB raw

Database overhead/indexes add more, but text-form storage is still modest.

## 7. Storage economics

R2 standard storage public pricing is around US$0.015/GB-month after included free allocation, with no normal internet egress fees. This makes 1 GB and 10 GB customer quotas economically reasonable, though operations and abuse still matter.

Never promise unlimited file storage.

## 8. Fixed infrastructure

Early stage can be near-zero excluding domain if free tiers suffice.

Once paid production starts, a realistic baseline may include:
- Supabase Pro: around US$25/month starting price
- Cloudflare paid Workers only if free allocation/runtime needs require it
- email provider paid plan only if volume requires it

At ₹499/customer, even a modest number of paying accounts can cover this baseline.

## 9. Simple break-even thinking

Ignoring taxes/support and assuming roughly ₹2,500–₹4,000/month baseline production SaaS tooling:
- ~13–21 Starter customers at ₹199 can cover that baseline gross revenue
- ~6–9 Pro customers at ₹499 can cover it

This is not an accounting forecast; it is a sanity check demonstrating why the product can remain cheap.

## 10. Cost-protection rules

- hard response quotas in V1, no silent overage
- storage quota
- file size limits
- email notifications opt-in, rate limited
- webhook retries bounded
- abuse/suspension policy
- fair-use ceiling even on "100 forms"

## 11. Pricing implementation

Define plans in one server module:
```ts
PLAN_ENTITLEMENTS = {
  free: {...},
  starter: {...},
  pro: {...}
}
```

Frontend imports safe display metadata, while server applies authoritative limits. Razorpay plan IDs are environment/config mappings, never user-provided values.
