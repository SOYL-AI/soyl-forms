# Azure lean launch migration proposal

Date: 10 October 2026. Status: approved; owner confirmed hosted signup/sign-in and authorized phase 2 to proceed on `migration/azure-lean-launch`. The converted application/database and workers are deployed to Azure staging; operational evidence and outstanding gates are recorded in [the staging runbook](23_azure_platform_staging.md). Recovery, logout/re-login, Android and real-provider feature acceptance remain production cutover gates. Production cutover has not happened.

Launch scope updated by the owner on 10 October 2026: Google sign-in is deferred until after launch. Email/password through Entra External ID is the launch method; Google configuration and acceptance do not block this migration. Web and Android email/password authentication acceptance remain required.

Owner confirmed a dedicated SOYL Forms identity tenant and USD 4,600 of Azure credits shared across company projects. Credit expiry remains unconfirmed. Isolated resource group: `soyl-forms-staging-rg` (Central India). External ID tenant: `soylforms.onmicrosoft.com`, tenant ID `47f0c7e0-77a5-4ae0-b3b4-b9b48269d014` (Asia Pacific identity geography). Existing company resources are outside this migration's scope.

## Objective and boundaries

Replace managed Supabase database/API/auth dependencies with Azure PostgreSQL, server-side database access, and Microsoft Entra External ID. Deploy the existing Next.js frontend and backend together on Azure Container Apps. Preserve the platform's current functionality, tenancy rules, and transaction guarantees.

Planning workload: 100 monthly active creators and 10,000 completed responses per month. This is not a concurrency specification or a measured capacity guarantee. Existing account/data preservation must be inventoried even though there are no customer accounts; operator accounts, forms, Razorpay references, and uploads may still exist.

The lean Azure allowance is INR 4,000-7,000 per month before taxes and credits, excluding AI and third-party R2/Resend/payment charges. Temporary staging and dual-running can add cost. Credit eligibility, expiry, regional SKU availability, and actual resource costs must be checked before provisioning. No subscription prices or entitlements change as part of this migration.

## Proposed architecture

| Component | Initial configuration |
| --- | --- |
| Application | Next.js container, Node 22+, Azure Container Apps Consumption, 0.5 vCPU/1 GiB, minimum 1 replica, maximum 3 |
| Database | Azure Database for PostgreSQL Flexible Server, B1ms, 32 GiB storage; same region as application, provisionally Central India |
| Customer auth | Entra External ID external tenant; browser-delegated email/password for launch; Google deferred |
| Database access | Typed server repositories using a bounded PostgreSQL connection pool; no browser database credentials or public PostgREST replacement |
| Sessions | Maintained OIDC/session library, secure HttpOnly cookies, shared durable session state where required; never process-local session state |
| Files | Existing private R2 bucket, verified-upload flow, signed downloads and staging lifecycle |
| Billing/email/AI | Retain Razorpay, Resend and existing AI provider integrations; migrate their database dependencies |
| Background work | Scheduled Container Apps Jobs for notification/webhook outbox and cleanup, with expiring database claims and bounded job concurrency |
| Delivery | Infrastructure as code, container registry, GitHub Actions with Azure workload identity, separate deployment and runtime identities |
| Operations | Health/readiness probes, structured logs, external uptime check, Azure alerts/budget, database backups and tested restoration |

No AKS, Redis, Service Bus, Front Door, private endpoints, or permanent second staging database are assumed in the lean estimate. Add a service only after a measured need and cost review. Choose private database networking compatible with the selected Container Apps environment, and verify its cost before deployment; do not expose PostgreSQL broadly to make deployment easier. Any necessary public-network fallback must have TLS verification and tightly scoped firewall access, never an unrestricted Azure-services allow rule.

## Phase 1: inventory and authentication proof

1. Capture the current platform flow matrix, baseline test/build results, Supabase call sites, database policies/functions, operational data and external integration configuration. Back up existing data and document what is preserved.
2. Validate Azure subscription/credits, region availability and resource budget. Create a dedicated External ID customer tenant/application. Google federation is a post-launch enhancement.
3. Prove signup, email verification, email/password login, recovery, logout, expiration, disabled-account behavior, and Android system-browser return before rewriting the rest of the platform.
4. Use authorization-code flow with PKCE, state/nonce checks, verified issuer/audience/signatures, allowlisted callbacks and a maintained library. Never collect Google credentials or implement password storage ourselves.
5. Use the Microsoft-hosted, branded customer login flow for launch. This changes the current inline password UI; Google federation requires browser-delegated authentication. Do not promise the exact existing password screen will remain.
6. Create application users with an internal UUID and a unique provider identity mapping keyed by verified issuer/subject. Account links require proof of ownership; never join accounts using an unverified email address alone. Provision a personal workspace once, transactionally. Invitations and super-admin access remain explicitly authorized.
7. For Android, use a tested HTTPS callback and a short-lived, single-use handoff where necessary to establish the WebView's cookie session. Do not put reusable session/access tokens in deep links. Device acceptance covers email/password for launch; test Google separately when it is added.

Exit: real-provider web and Android authentication works in the proof environment, including negative/security cases. If it does not, resolve the failure before the broader migration.

## Phase 2: database and authorization migration

1. Add a separate versioned Azure migration baseline derived from the existing schema, preserving the historical Supabase migration files. Subsequent Azure migrations have their own tracked history and run once under a migration identity with an advisory lock.
2. Replace foreign keys to `auth.users` with application users. Migrate Supabase-specific roles, grants, `auth.uid()` policies, and helper functions deliberately; do not create dummy auth services to make old migrations pass.
3. Preserve immutable published versions, JSONB answers, UUIDs, quota accounting, paid submissions, verified file bindings, resume identity, idempotency, outbox leases and all existing business invariants.
4. Replace `.from()`/`.rpc()` calls with parameterized server repositories and SQL function calls. Cover all routes, server actions, admin tools, MCP, brand/AI credits, workspace/team management, exports and deletion paths.
5. Enforce workspace membership and roles before tenant operations. Add database defense in depth with RLS and a transaction-local trusted user context; set/reset context within each transaction so pooled connections cannot leak tenant identity. The app runtime role is not the database owner and has no general RLS bypass. Restrict privileged functions and worker permissions explicitly.
6. Run integration tests on real PostgreSQL using the production roles, concurrent connections and migrations. Retain the existing regression suite; PGlite alone is not the Azure acceptance gate.

Exit: migrated functionality and adversarial cross-workspace tests pass; there is no runtime Supabase API/auth requirement left in the Azure target build.

## Phase 3: infrastructure and background processing

1. Add a reproducible production container and infrastructure/deployment definitions. Use secrets through Azure secret references/managed identity where supported; keep credentials out of Git and client bundles.
2. Configure TLS/domain, OIDC callbacks, Android app links, Razorpay webhooks, R2 CORS, verified-upload lifecycle and email sender configuration for the new environment. Google redirects are deferred with Google sign-in.
3. Implement Azure-specific trusted-proxy client-IP handling from documented ingress behavior and test forged forwarding headers. Azure now uses the rightmost appended forwarding address; a dedicated rate-limit HMAC secret replaces the Supabase key in Azure builds.
4. Separate lightweight liveness from readiness. Readiness checks PostgreSQL with a timeout and confirms the expected migration version without exposing secrets.
5. Run outbox processing every minute and cleanup hourly. Preserve frozen email payload/provider keys, destination-level delivery state, bounded retries, expiring claims and failure visibility. Adapt batch sizes/time budgets to measured throughput rather than carrying forward a fixed 25-event HTTP-worker ceiling. Scheduled jobs use UTC cron expressions and dedicated job timeouts; overlapping executions cannot double-claim events.
6. Provision backups/PITR and exercise restoration to a separate temporary database/server. Document connection/secret switching and domain rollback.
7. Deploy preview first. Keep existing production running until acceptance passes. Production release uses an explicit CI environment gate, a single migration step, probes and controlled traffic switching.

## Phase 4: end-to-end and load acceptance

The release is accepted only after all current features are exercised against Azure and the real integration providers:

- Email/password auth/session/recovery/Android; workspace invitations and all four membership roles; super-admin audit and suspension. Google sign-in is outside launch acceptance.
- Form creation, templates, builder autosave/revision conflicts, every current question type, validation, logic/formulas/recall, themes/brand assets, localization, quizzes, versioned publication, closure and quotas.
- Public desktop/mobile forms, QR links, embeds, refresh recovery and cross-device resume; existing sessions complete against their original version.
- Free and paid submissions, files, answer validation and atomic quota boundaries. Repeated/network-retried submissions save one response and consume each payment once.
- Starter/Pro monthly/yearly checkout, cancellation, payment collection, signature verification, duplicate/out-of-order webhooks, credit packs and server-confirmed entitlements. Test-mode coverage plus a controlled live-mode smoke test before public payments.
- Response analytics over more than 2,000 rows, filtered pagination, tags/notes/editing, CSV/export, protected downloads and account deletion.
- Owner/responder email, webhooks/Google Sheets, scheduler operation, worker crashes and retry recovery. Exercise MCP key authorization and operations. Preserve and smoke-test existing AI functionality while excluding its cost from this plan's financial model.
- CSRF/session fixation/forged callbacks, unauthorized admin access, cross-tenant reads/writes, upload tampering, SSRF/private redirects, spoofed IP headers, shared rate limits and secrets not appearing in bundles/logs.

Proposed load-test gates (targets to prove, not current capacity claims):

- Seed 100 creator workspaces and at least 10,000 responses with realistic form/version/answer distributions.
- Exercise 50 simultaneous respondent sessions, a mixed read/write workload including 5 completed text submissions/second for 30 minutes, and a short 10 submissions/second burst for five minutes. Include a deliberately hot single form and concurrent submissions in the same workspace to expose lock contention.
- Target warmed non-provider submission API p95 below one second at steady load and below two seconds during the short burst, with fewer than 1% unexpected server errors. Track intentional quota/rate-limit rejections separately. Test browser experience separately from API latency; exclude payment/AI provider processing from the submission API target.
- Verify zero missing acknowledged responses, zero duplicate responses/charges, exact quotas, and recovery after an app/worker restart. Use separate abuse tests; do not disable the production rate limiter to claim launch capacity.
- Size notification processing so the expected launch workload is delivered within five minutes when providers are healthy. Measure backlog recovery after burst tests independently; document the observed drain time, with a proposed target under 30 minutes after the burst ends. These gates may require worker batching/concurrency tuning.
- Complete the full test/typecheck/lint/build pipeline and an actual Azure backup/restore drill. If B1ms cannot pass, report the bottleneck and revised configuration/cost; do not mark it production-ready simply because the budget was approved.

## Scaling and operations

Initial limits are cost and safety controls, not a promised number of users:

| Stage | Change | Trigger |
| --- | --- | --- |
| Lean launch | App min 1/max 3, B1ms, bounded pools | Pass the release gates for the initial workload |
| App pressure | Tune queries then memory/CPU and HTTP concurrency; adjust max replicas with DB connection budget | Sustained app saturation or measured latency breaches while database has headroom |
| Database pressure | B1ms to B2s for intermittent load, or directly General Purpose for sustained load/CPU-credit depletion | Persistent database saturation, repeated pool waits, long transactions or low CPU-credit balance |
| Predictable production | General Purpose, built-in transaction pooling where supported, min 2 app replicas, reprice uptime needs | Growing sustained traffic or availability requirements |
| Larger growth | Separate worker scaling, indexes/query improvements, selective public-version caching; consider a broker/read replicas only after measurement | Outbox delays, analytical contention or measured queue/read bottlenecks |

B1ms currently has 50 total connections, of which 35 are user connections, and no built-in Azure PgBouncer. Start with one shared pool per app process capped at three connections. Three app replicas use at most nine app connections; budget eighteen during overlapping revisions, plus separate bounded job pools, migrations and administration, and keep the planned total below 30. Verify provisioned limits rather than blindly increasing `max_connections`. Autoscaling cannot fix a saturated database or per-workspace transaction locks.

Proposed alerts: API p95 above 1 second or unexpected 5xx above 1% for ten minutes; app CPU above 70% for 15 minutes/memory above 80%; DB CPU above 70% for 15 minutes, declining CPU credits, pool waits and rising locks; storage above 70% (grow before it becomes critical); oldest pending outbox above five minutes; job failures; failed/ambiguous payment/email events; external uptime failures. Set cost alerts at 50%, 80% and 100% of the budget, plus forecast alerts. Budget alerts are not a hard spending cap. Alerts must not shut off paid submissions automatically.

Use seven-day PITR initially and record the measured restore duration. Aim to demonstrate recovery within two hours for the initial database size; this is an operational target, not a contracted SLA. The lean single-database deployment has no zone-redundant HA, so maintenance and recovery can cause downtime. Add HA with a revised budget when the business requires it.

Do not promise a fixed paid-user capacity from a monthly response count: 100 Starter workspaces can consume 500,000 responses/month at their quotas, while 100 Pro workspaces can consume 2.5 million. Rebenchmark and forecast costs as actual usage and burst patterns grow.

## Cutover and rollback

- Preserve a snapshot/export of the current environment and keep credentials/old deployment available until the new one is stable. Confirm which internal/operator data must survive; no destructive reset is assumed.
- Before cutover, freeze any internal writes, take a final export if needed, validate row counts and referential links, then deploy and switch callbacks/webhooks/domain together. Create or map the operator identity through a verified flow.
- Roll back an application revision only when it is compatible with the Azure schema. After Azure accepts new writes, returning to Supabase requires write reconciliation; do not point traffic back to stale data. Prefer a compatible forward fix or Azure restore with an explicit data-recovery plan.
- Observe errors, latency, billing events, queues and costs closely after cutover. Decommission Supabase only after real-provider acceptance and a successful recovery rehearsal, and after preserved data is accounted for.

## Break-even model, excluding AI

Current prices in `lib/plans.ts`: Starter INR 199/month or 1,990/year; Pro INR 499/month or 4,990/year. A paid user in this model means a paying workspace/subscription, not a team seat or form respondent.

Assumed domestic payment fee: 2% plus 18% GST on that fee, or 2.36% of the charge. Confirm the actual Razorpay subscription/payment-method terms before launch. Monthly contribution before other costs: Starter INR 194.30; Pro INR 487.22; a 70/30 Starter/Pro blend approximately INR 282.18.

| Monthly cost to cover | All Starter | All Pro | Approx. 70/30 monthly-billed blend |
| --- | ---: | ---: | ---: |
| INR 4,000 | 21 | 9 | 15 |
| INR 7,000 | 37 | 15 | 25 |
| INR 10,000 planning allowance | 52 | 21 | 36 |

The INR 10,000 allowance is a planning reserve for lean Azure plus non-AI R2/email/domain/monitoring and variability; it is not a measured third-party quote. For example, 17 Starter plus 8 Pro monthly subscriptions contribute approximately INR 7,201 after the assumed payment fee (rounding actual gateway deductions can differ). Target 40-50 monthly-equivalent paid workspaces for a healthier initial operating buffer; this is not a revenue forecast.

Formula: required paying workspaces = ceiling(fixed monthly cost / (weighted monthly net subscription revenue - per-workspace variable costs)). Recalculate at each usage/cost tier rather than assuming the same Azure bill at full plan utilization.

Annual billing lowers the monthly-equivalent contribution: a 70/30 blend yields about INR 235.15/month after fees, so approximately 30 such subscriptions cover INR 7,000. If displayed prices include 18% sales GST, an illustrative monthly-billed blend contributes about INR 238.09 after subtracting the tax component and the assumed fee, also requiring approximately 30 subscriptions for INR 7,000; actual tax registration, invoice treatment and input-credit accounting require confirmation. Credits reduce cash outlay but are not recurring profit. These are infrastructure/operating-cost break-even figures, excluding AI, salaries, support labor, marketing, refunds and income tax; they do not establish full business profitability.

## Prerequisites after approval

Required provisioning inputs: Azure subscription/resource access, credit balance/expiry/eligible services, selected region and domain/DNS access; External ID tenant/app; existing R2, Resend and Razorpay test/live configuration; decision on retaining internal test/operator data. Google OAuth administration is needed only for the deferred enhancement. Supply secrets through local secret configuration or the cloud secret store, never chat or Git. Start implementation with the isolated auth proof, then database conversion, then infrastructure and staged verification. Production cutover remains the final reviewable release step.

## Sources checked

- [Entra authentication methods and Google browser flow](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers)
- [Entra login branding](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-branding-customers)
- [Azure PostgreSQL connection limits and pooling availability](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits)
- [Container Apps scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- [Container Apps Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [PostgreSQL backup/restore](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore)
- [Azure retail pricing API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
- [Razorpay fees](https://razorpay.com/pricing/)
