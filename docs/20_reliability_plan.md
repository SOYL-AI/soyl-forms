# Reliability and security implementation plan

Scope: fix every concrete defect identified in the October 2026 project review. Product expansion suggestions (CRM integrations, new layouts, imports, and conversion experiments) are separate roadmap work.

1. Make paid submissions atomic and retry-safe; enforce form caps inside the transaction.
2. Enforce editor permissions on mutations and protect secret columns.
3. Protect outgoing website/webhook requests against private addresses, redirects, and DNS rebinding.
4. Verify stored uploads, atomically reserve quota, and validate file ownership/question bindings.
5. Repair resume loading, cross-device progress, version pinning, and persistent submission keys.
6. Isolate draft settings from published behavior.
7. Replace capped analytics and client-side response filtering with database queries and pagination.
8. Give outbox jobs expiring atomic claims and destination-specific delivery state; retry emails safely.
9. Enforce shared public rate limits and trusted proxy IP handling.
10. Upgrade vulnerable dependencies and complete regression, database, and production-build verification.

All database changes ship as numbered migrations. No production migrations or deployment occur as part of local verification. Record the final checks and required rollout configuration here when complete.

## Implementation completed

- Payment validation, upload attachment, submission insertion, quota accounting, visit completion, resume invalidation, and outbox insertion now share one PostgreSQL transaction. Retry acknowledgments also preserve quiz scores. Draft saves detect revision conflicts.
- Editor permissions gate publication, integrations, creator uploads, and brand operations. Viewers receive read-only controls. Authenticated database clients cannot select encrypted payment or webhook secrets.
- Outgoing HTTPS requests reject private/reserved addresses, pin validated DNS results, bound response size and time, and validate every permitted GET redirect. Webhook POST redirects are not followed.
- Upload authorization reserves storage atomically and signs size/type. Completion checks stored size/type and file signatures, then copies verified bytes to a new immutable key. Submissions accept only verified files bound to the correct workspace, form, and question. SVG uploads are excluded. Cleanup serializes expiry with attachment and retries failed object deletions.
- Resume links load before rendering, preserve the original version/session/submission key across devices, and restore question/history/answers. Refreshes retain local drafts and identity. Public session-only deletion was removed. The repeat restriction remains a per-device convenience, not verified respondent identity.
- Live forms use immutable published settings/theme/schema. Existing sessions can finish the published version they opened.
- Analytics aggregate all responses in PostgreSQL. Search, dates, and tags apply before pagination. Visits deduplicate refreshes, and question reach uses recorded question visits rather than inferred question order.
- Outbox claims are atomic and expire. Successful destinations remain acknowledged during other destination retries. Notification emails reserve quota once and use frozen payloads and stable provider idempotency keys. Ambiguous delivery older than 23 hours becomes failed for operator investigation rather than being blindly resent.
- Production rate limits use shared database counters, fail closed on backend errors, hash identifiers, and accept client-IP headers only for an explicitly trusted proxy.
- Next.js and affected runtime libraries were upgraded; asynchronous request APIs were migrated. Production dependency audit reports zero vulnerabilities.

## Verification

250 automated tests across 30 files pass, including PostgreSQL execution of all numbered migrations in PGlite and real renderer DOM tests. Coverage includes payment reuse, UUID attachment, submission caps, file ownership, cleanup ordering, resume recovery, lease recovery, secret permissions, email retry identity, and queries over 2,100 responses. ESLint and the standalone TypeScript check pass. Local production smoke checks return HTTP 200 for the home page, demo form, login, and pricing; an unauthorized cron request returns HTTP 401. The optimized production build passes and checks TypeScript as part of compilation.

Local tests do not establish live Supabase, R2, Razorpay, or Resend behavior. Verify the following in staging before production rollout.

## Rollout

1. Back up the database. Apply migrations `0012` through `0016` in order during a coordinated maintenance window, then deploy this application build and resume traffic. Migration `0012` revokes the old unsafe submission RPC, so old application instances must not continue serving submissions. Do not roll back application code alone after these migrations.
2. Use Node.js 22.12 or newer. Install from the checked-in lockfile. Keep service-role credentials exclusively on the server.
3. Configure `TRUSTED_PROXY` only when the hosting proxy overwrites the chosen header and the origin cannot be bypassed: `cloudflare` uses `cf-connecting-ip`, `vercel` uses its overwritten forwarding header, and `custom` uses `x-real-ip`. Without configuration all anonymous requests share a conservative bucket. Optionally configure `RATE_LIMIT_SECRET`; the service-role key is the fallback HMAC key.
4. Configure R2 CORS for the app origins, PUT requests, and signed content-type/content-length headers. Add an R2 lifecycle rule deleting `staging/` objects after one day: a still-valid PUT URL can recreate a staging object after verification. Keep the bucket private. Verified objects under `workspace/verified/` must not receive this lifecycle rule.
5. Schedule `/api/cron/outbox` and `/api/cron/cleanup` with the existing bearer `CRON_SECRET`. Confirm `EMAIL_FROM`/Resend credentials. Inspect failed outbox events, especially ambiguous email acknowledgments; webhook consumers should deduplicate the stable event ID because external delivery is at least once.
6. Exercise free and paid forms, duplicate retries, cross-device resume, file uploads, concurrent quota boundaries, viewer access, email notifications, webhooks, and searches beyond the first page against staging services. Existing pending uploads without verification must be uploaded again; existing attached files remain readable. Abandoned uploads expire after 24 hours, so a longer-lived resume link may require re-uploading files.

## Remaining external dependency advisory

The full development dependency audit reports seven affected packages from one unpatched `braces` stack-exhaustion advisory (`GHSA-vfj7-8cjw-p6xm`), inherited through Tailwind 3 and Next's ESLint tooling. Production dependencies are clean. No patched `braces` release is available in the registry used for this change. The suggested audit fix replaces Tailwind with version 4 and downgrades Next's ESLint configuration; it is not a safe automatic fix. Keep build glob configuration trusted, monitor the upstream fix, and track a separately validated Tailwind 4/tooling migration. This residual advisory is not claimed as resolved.

## Product roadmap

CRM integrations, additional respondent layouts, import tools, and conversion experiments remain product work. These reliability fixes improve the foundation but do not by themselves establish that the product outperforms Typeform.
