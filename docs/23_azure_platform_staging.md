# Azure platform staging and release runbook

Updated 10 October 2026. Owner confirmed real hosted signup/sign-in and authorized the application/database migration. The full Azure application is deployed to staging. Production traffic has not moved, and launch acceptance is not complete.

Preview: https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io/login

## Deployed configuration

| Component | Actual staging configuration |
| --- | --- |
| Resource group | `soyl-forms-staging-rg`, Central India |
| Web application | `soyl-forms-web`, Container Apps Consumption, 0.5 CPU/1 GiB, min 1/max 3 replicas, HTTP concurrency 20 |
| Application image | `soylformsn4nsiocbpshei.azurecr.io/soyl-forms@sha256:a6ff1d1030074bee9aba52661784f72a097bf6d124ee068e5706edb491749ae6` |
| Current revision | `soyl-forms-web--0000003` |
| PostgreSQL | `soyl-forms-pg-n4nsiocbpshei`, PostgreSQL 17, B1ms, 32 GiB, private network only, 7-day PITR, no HA |
| Schema | Azure migrations `0001` through `0024`; immutable SHA-256 migration history and advisory locking |
| Migration image | `soylformsn4nsiocbpshei.azurecr.io/soyl-forms-migrations@sha256:74a9f03069ca3cd71e710deebc59778ce0da5c423c06cafeb6875c4b5b976f69` |
| Database credentials | Separate migration owner and restricted runtime role; verified TLS; runtime pool max 3/process |
| Jobs | Outbox every minute; cleanup at minute 7 each hour, UTC. Separate scheduler identity, CRON secret only |
| Provider storage | Existing private R2 bucket; staging CORS added while preserving existing production origins |
| Billing | Existing Razorpay test keys/plans. A separate staging webhook subscribes to ten subscription lifecycle events; existing hooks preserved |
| Customer identities | Dedicated SOYL Forms Entra External ID tenant; email/password. Google deferred |
| Secrets | Key Vault references with per-secret managed identity grants. No owner database URL in the web application |
| Logs and budget | 30-day Log Analytics retention, 0.1 GiB/day ingestion cap; INR 7,000/month budget with actual/forecast alerts, including managed environment RG |

Migration execution `soyl-forms-migrate-xmjza15` applied migration 0024 and verified all 24 file checksums. Readiness refuses to serve this application against an older schema. Source Supabase migrations remain unchanged. Azure builds select `NEXT_PUBLIC_BACKEND=azure`; the legacy production build still defaults to Supabase.

The migration covers creator/dashboard/builder operations, public submissions/progress/resume/uploads, responses/CSV, brands, team permissions, operator tools, subscriptions/payment collection/credit packs, AI credit accounting, MCP, outbox and cleanup. Typed repositories use parameterized queries and transaction-local user context. Published versions remain immutable. Sensitive public/worker operations use narrowly granted SQL functions; ordinary runtime queries do not bypass RLS.

## Verification evidence

| Check | Result and limit |
| --- | --- |
| Regular regression suite | 299 passed, 19 opt-in PostgreSQL tests skipped; typecheck and lint passed, including three directory-deletion regression tests |
| Real PostgreSQL | All 19 auth/platform integration tests passed using the non-owner runtime role, including cross-workspace access, concurrent quotas/invitations, immutable publications, lease fencing, MCP, billing accounting and durable deletion |
| CSV | More than 10,000 rows streamed and checked for complete output, tags and final row; repeatable-read snapshot, bounded cursor chunks and cancellation cleanup |
| Azure image | Full Next.js production build passed in Docker; runtime runs as a non-root user |
| Staging HTTP smoke | Execution `soyl-forms-verification-19hq170` succeeded: real SSR, progress, resume save/read/invalidation, retry-safe submission, actual R2 PUT/verification/attachment, anonymous private download denied and concurrent submissions |
| Smoke accounting | 4 seed + 12 acknowledged = 16 database rows = 16 usage. Free-response outbox drained; two test workspaces/users and the R2 test object removed |
| Directory provider | A dedicated generated customer fixture was created/deleted with real Graph application credentials; deletion retry verified and all generated directory fixtures removed. In-app interactive deletion remains an acceptance gate |
| Cleanup | Actual scheduled-job execution `soyl-forms-cleanup-14f8gqx` succeeded against the deployed app |
| Sustained load | Running under execution `soyl-forms-verification-oa9qzp2`; final results will be recorded after accounting verification and fixture cleanup |

The load runner seeds 100 labelled synthetic creator workspaces and 10,000 responses, exercises 50 simultaneous submissions, 5 submissions/second for 30 minutes and 10/second for five minutes, plus public page reads. It uses the actual deployed API and rate limiter. Requests originate in Azure Central India and are spread over 100 forms. This measures regional API throughput, not end-user browser latency or geographically distributed traffic to one hot form. The smoke test separately exercises ten concurrent submissions in the same workspace. Payment/provider and paid email throughput are outside the measured submission latency.

A rolling update from revision 2 to revision 3 was performed during steady traffic. Inspect the final load report before claiming restart/revision recovery passed.

## Backups and actual restore drill

Preserved source export: 29 tables/109 rows, including four old accounts, five forms, eight responses and one file reference. The REST export had matching double reads, but is **not an atomic PostgreSQL snapshot**. Take a final consistent export during a write freeze if importing at cutover. Archive and credentials remain in ignored local storage; neither customer data nor secrets belong in Git.

The one referenced R2 object was downloaded and verified using conditional ETag reads, a second HEAD, byte count and SHA-256. No source data/object was deleted. The owner must choose whether to import the old internal data or launch clean while preserving it. Do not merge identities by email automatically; any account/workspace mapping needs an explicit verified identity migration.

Actual Azure PITR drill:

1. Created temporary private server `soyl-forms-restore-20261010` from the staging source at the latest recovery point. Resource creation timestamp: `2026-10-10T15:53:00.379885Z`.
2. Ran `soyl-forms-restore-verification-4yaxlbi` using the migration and separate runtime credentials. It verified 23 matching migration checksums, the existing owner identity/session and a restricted runtime role; anonymous form reads returned no private data.
3. Verification completed at `2026-10-10T16:05:14.3885006Z`: approximately **12 minutes 14 seconds** from resource creation through validation.
4. Removed the temporary server after validation. The drill preceded migration 0024 and load fixtures; it does not prove restoration of the later 10,000-response dataset.

Recovery procedure: pause application writes and scheduler calls, restore to a separate private server on the same VNet/DNS configuration, validate checksums/data/role restrictions with `check-restored-database.mjs` adapted to the explicitly selected restore host, replay any compatible forward migrations, then update **both** migration and runtime Key Vault URLs to that server. Refresh secret references/create a new application revision, check readiness, verify a controlled write/read and scheduler, and only then resume traffic. Preserve the old server until reconciliation is complete. Record the recovery point and any writes after it; PITR does not guarantee zero lost writes. Key Vault secret rotation/reference refresh must be verified rather than assumed immediate.

## Worker and deletion behavior

The outbox claims one event with a lease, checkpoints each destination, freezes email provider requests/idempotency keys and caps retries. Default batch limit is 500, with a 30-second work budget; overridable from 1 to 1,000. This removed the old 25/minute ceiling. Provider timeouts still bound a last in-flight call beyond the budget. Free-response drain throughput does not establish Resend/webhook throughput.

Account deletion immediately disables application access and revokes sessions/API keys. A durable job cancels subscriptions, deletes private objects, removes the verified Entra directory object and then purges application PII. Completed stages survive retries. A Graph DELETE 404 is accepted only if a subsequent GET also confirms absence; real provider testing exposed a brief write/read replication inconsistency for newly created accounts. Existing sessions from before OID capture require signing out/in before deletion. Directory deletion is soft-retained by Microsoft's recovery policy; database backups expire on their retention schedule.

## Monitoring and response

`azure/platform-monitoring.bicep` provisions an action group for subscription Owners and these enabled alerts:

- DB CPU average above 70%/15 minutes, storage above 70%/5 minutes, connections maximum above 25/5 minutes.
- App CPU average above 70%/15 minutes, memory average above 80%/15 minutes, response-time **average** above 1,000 ms/15 minutes, more than five 5xx requests/5 minutes.
- Worker failure/lease loss, terminal delivery failures, oldest queued response above five minutes, account deletion above one day; no successful outbox heartbeat in five minutes.

Thresholds use actual available Azure metric names/units. They do not implement the proposed p95/1% request SLO. External uptime, provider-specific payment failure alerting, CPU credit depletion, pool-wait/lock monitoring and a notification delivery drill remain operational work before production. Owner recipients are configured; receipt of an actual test alert has not been confirmed. Missing log ingestion can trigger the heartbeat alert, including when the daily ingestion cap is reached. Monitor the cap and actual costs before reducing visibility or raising limits.

On an alert, inspect readiness, revision health, database CPU/connections/storage, scheduler executions and structured queue counts. Avoid printing provider bodies, answer payloads or secrets into incident logs. A backlog with healthy submissions calls for worker/provider investigation; do not disable paid submissions automatically. When the DB is healthy and the app is saturated, tune app resources/concurrency first. For persistent DB pressure/CPU credit depletion, move to B2s for intermittent load or General Purpose for sustained load and rebenchmark. Maintain a connection budget below 30 on B1ms, including overlapping revisions/jobs/operators. See `21_azure_migration_plan.md` for scaling and break-even assumptions.

## Delivery and remaining launch gates

CI now runs the regular checks and a separate PostgreSQL 17 service job that applies migrations twice, creates the restricted role, executes the real database tests and builds the Azure target. `azure-staging.yml` provides a manual, serialized staging release after CI, using Azure OIDC rather than a stored password. Its identity is restricted to pushing the registry and updating the staging web/migration resources; it has no direct Key Vault read permission. The `azure-staging` GitHub environment restricts deployment to `migration/azure-lean-launch`; authorized staging work does not require another human approval. Migration success is required before changing the app; the workflow checks the new revision's readiness. The workflow has not yet been exercised from GitHub, and must exist on the default branch before normal manual dispatch is available. Production needs its own reviewed environment/identity/domain gate; this workflow cannot deploy production.

Before production cutover:

1. Resolve the old-data decision and validate any import, account mapping and final source snapshot.
2. Supply Resend through local secret configuration/Key Vault, verify the sender domain, then test real owner/respondent email and retries. There is currently no configured Resend key.
3. Complete password recovery, logout/re-login, explicit email verification observation, every interactive creator/form feature and real in-app deletion. The CLI operator lacks permission to inspect the Entra email OTP policy; a tenant administrator must verify/reset policy through the tenant's normal administration flow. Do not grant the runtime application policy-write permission for setup.
4. Test Android signup/login/recovery/logout/system-browser return and actual device forms/files/payments. A separate QA APK is available locally; no store release has occurred.
5. Complete real Razorpay test checkouts for subscriptions, cancellation, credit packs and form payments, plus duplicate/out-of-order events. Test webhook configuration alone is not payment acceptance. Configure production callbacks/webhook secret and perform controlled live-mode acceptance before public paid traffic.
6. Finish sustained load, accounting/cleanup, deliberately hot-form/rate-limit tests, worker restart recovery, real webhook/Sheets delivery and AI smoke. Capture the limits of each result.
7. Verify alert delivery/external uptime, exercise the CI release, review dependency findings, credit expiry and actual costs, then produce the concrete production cutover for final review.

Production runtime dependency audit currently reports zero vulnerabilities. Seven high findings remain in development/build tooling through the braces dependency; the available force changes would change major toolchains and are not a safe unattended fix. Do not classify the entire dependency tree as clean.

No production DNS, live payment webhook or Vercel deployment has been switched. Keep the old deployment available until cutover acceptance and data reconciliation are complete. After new Azure writes exist, rollback to stale Supabase would require reconciliation; prefer a compatible prior Azure app revision or a forward fix. Migration rollback is not automatic.
