# Current External References Used for Planning

Checked September 17, 2026. Provider pricing and APIs can change; implementation must re-check official documentation.

## Cloudflare
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Next.js on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/

Planning notes:
- Workers has a free allocation and low-cost paid path.
- R2 standard storage public price is around $0.015/GB-month, with included free usage and no internet egress charge.
- Cloudflare's August 2026 Next.js guidance recommends vinext for new Workers deployments.

## Supabase
- Pricing: https://supabase.com/pricing
- Next.js Auth quickstart: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- SSR Auth: https://supabase.com/docs/guides/auth/server-side

Planning notes:
- Free plan includes a small Postgres database and MAU allocation suitable for development/hobby usage.
- Pro starts around $25/month and adds larger DB/egress plus backups.

## Razorpay
- Pricing: https://razorpay.com/upi-payment-gateway-india/
- Subscription APIs: https://razorpay.com/docs/payments/subscriptions/apis/
- Create Plan: https://razorpay.com/docs/api/payments/subscriptions/create-plan/
- Webhook validation/testing: https://razorpay.com/docs/webhooks/validate-test/

Planning notes:
- Standard domestic headline payment gateway fee is commonly shown as 2% plus applicable GST.
- Razorpay Subscriptions supports recurring plan/subscription workflows.
- Webhook signature verification must use the raw body.
- `x-razorpay-event-id` is useful for deduplication.

## Competitor pricing references
- Typeform: https://www.typeform.com/pricing
- Tally: https://tally.so/pricing
- Jotform: https://www.jotform.com/teams/pricing/

These are only market references. Do not copy proprietary UI assets or make stale comparative claims.
