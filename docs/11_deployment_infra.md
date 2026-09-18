# Deployment and Infrastructure

## 1. Goal

Keep V1 operational cost close to zero until usage justifies paid infrastructure, while retaining a clean upgrade path.

## 2. Application hosting

Preferred: Cloudflare Workers.

Current Cloudflare guidance for new Next.js applications should be followed at implementation time. As of August 2026, Cloudflare recommends vinext for new Next.js applications on Workers.

Use:
- preview deployments for pull requests if convenient
- production branch deployment
- environment-specific secrets

## 3. Database/auth

Supabase:
- PostgreSQL
- Auth
- RLS

Free tier is acceptable for development/very early usage, but note free projects may have limitations/pausing. Move to Pro when the product has real production dependency or paying users.

Production rule:
Backups and predictable availability matter more than saving the final few dollars once customers pay.

## 4. Object storage

Cloudflare R2 private bucket for respondent uploads and creator logos.

R2 is attractive because:
- inexpensive storage
- no normal internet egress charge
- S3-compatible API

Use lifecycle cleanup for orphan uploads where possible.

## 5. Email

Use Resend or equivalent.

Email types:
- auth emails may be handled/configured through Supabase provider setup
- owner response notification
- daily digest later
- billing/usage warnings
- account/system notifications

Do not send one email per response by default on free plan. Make notifications opt-in and enforce email usage limits.

## 6. DNS and domain

Cloudflare DNS recommended if Workers/R2 are already used.

Suggested hostnames:
- `www.domain.com` marketing/app redirect pattern
- `domain.com` main app
- custom domains future

Do not require separate app/api subdomains in V1 unless deployment architecture demands them.

## 7. Environments

Minimum:
- local development
- production

Recommended once billing goes live:
- staging with Razorpay Test Mode
- production with Razorpay Live Mode

Never use live Razorpay secrets in preview/staging.

## 8. Observability

At minimum:
- structured application logs
- request IDs
- error boundary pages
- Sentry/error tracker for unhandled exceptions in production
- uptime check for public app and billing webhook endpoint

Metrics to monitor:
- 5xx rate
- submit failures
- DB errors
- webhook failures
- Razorpay webhook verification failures
- upload failures
- response latency

## 9. Backups

Once paying customers exist:
- use Supabase paid backups
- document restore process
- test restore periodically
- R2 object versioning/backups only if business value justifies it

## 10. CI/CD

On every PR/push:
- install frozen lockfile
- typecheck
- lint
- unit tests
- build

Before production deploy:
- DB migration compatibility check
- E2E smoke tests on critical flows where practical

## 11. Cost guardrails

- Cloudflare/Supabase spend alerts where available
- app-level file size limits
- monthly workspace storage counters
- response limits
- rate limits
- email limits
- do not permit unbounded custom webhook retries

## 12. Cheapest practical launch posture

Early hobby stage:
- Cloudflare free allocation
- Supabase Free
- R2 free included allocation
- low-volume email free tier
- domain cost only

Production/paid stage likely begins with Supabase Pro plus any Cloudflare paid compute/email needs. Keep margin high by enforcing plan limits rather than subsidizing extreme users.
