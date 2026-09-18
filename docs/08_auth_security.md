# Authentication and Security

## 1. Authentication

Use Supabase Auth with cookie-based SSR suitable for Next.js.

Initial auth methods:
- email/password or email OTP/magic link
- Google OAuth optionally

Keep auth implementation aligned with current Supabase SSR guidance at build time. Never trust a user object merely deserialized from unverified client storage for authorization.

## 2. Workspace authorization

Every protected action verifies:
1. authenticated user identity
2. workspace membership
3. role capability
4. resource actually belongs to that workspace

Never accept `workspace_id` from the client as proof of access.

## 3. RLS

Enable RLS on tenant tables exposed through Supabase APIs.

Public submissions should go through a controlled server endpoint rather than granting anonymous users broad insert privileges.

## 4. Service credentials

- Supabase service role: server-only, never `NEXT_PUBLIC_*`
- Razorpay secret: server-only
- Razorpay webhook secret: server-only
- R2 credentials: server-only unless using tightly scoped signed operations
- email API key: server-only

The build must fail loudly when required production secrets are absent.

## 5. Super-admin security

- server-side admin lookup
- no role determination from query parameters/localStorage
- audit all destructive/moderation actions
- ideally require stronger login controls later (MFA)

## 6. Form abuse/spam

Use layered defense:
- per-IP/session rate limiting
- Cloudflare Turnstile on suspicious/high-volume forms or optionally per form
- hidden honeypot optional
- submission velocity anomaly flags
- file upload stricter limits

Do not make every normal response solve a visible CAPTCHA unless abuse requires it.

## 7. Input security

- sanitize/escape all creator-controlled text when rendered
- never render arbitrary raw HTML from a form creator in V1
- block `javascript:` URLs
- validate URLs server-side
- file allow-list for MIME and extension
- limit text lengths at DB/API boundaries

## 8. XSS

Question titles/descriptions are untrusted creator content. Render as text/approved rich-text AST, never `dangerouslySetInnerHTML` with raw user input.

If rich text is added, use a strict sanitizer and limited schema.

## 9. CSRF/session security

Use framework/provider protections and same-site secure cookies. Sensitive mutations must require authenticated server context. Avoid designing custom token systems unnecessarily.

## 10. Payment security

- do not store card/payment credentials
- use Razorpay Checkout/Subscriptions
- verify webhook HMAC on raw body
- use `x-razorpay-event-id` for idempotency
- webhooks can arrive more than once and out of order
- entitlement changes follow verified provider state

## 11. SSR caching safety

Authenticated pages/responses must not be shared-cached across users. Follow current Supabase SSR guidance around cookie refresh and caching.

## 12. File security

Private response uploads should not be permanently public URLs.

Use:
- private R2 bucket
- authorized short-lived signed download URLs or a protected download route
- content disposition on download
- optional malware scanning future

## 13. Data minimization

Do not persist raw IP addresses longer than necessary. Prefer coarse metadata or rotating salted hashes for abuse detection.

Do not duplicate form answer payloads into logs, audit events or error trackers.

## 14. Deletion

When a user deletes a form/workspace:
- mark deletion state
- revoke public access quickly
- remove DB data and R2 objects according to defined retention/background cleanup
- keep only legally/operationally necessary billing/audit metadata

## 15. Security headers

Configure sensible defaults:
- HSTS in production
- Content-Security-Policy compatible with Razorpay and required assets
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- frame rules that still allow intended form embedding through explicit CSP `frame-ancestors` strategy

## 16. Secrets and `.env`

Never commit `.env.local` or production secrets. Commit only `.env.example` with names and comments.
