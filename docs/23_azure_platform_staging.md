# Azure platform staging and release runbook

Updated 12 October 2026. Owner confirmed real hosted signup/sign-in and authorized the application/database migration, direct main pushes and replacing Resend with Azure email. The production domain now serves the Azure application after successful release `38141513869`. Live billing configuration is deployed; signed-in production browser, payment/email and Android launch acceptance remain incomplete.

Production: https://forms.soylai.com/login. The generated Azure hostname remains available for probes and scheduler calls; authentication now uses the production origin.

## Deployed configuration

| Component | Actual lean production configuration (existing resource group retained) |
| --- | --- |
| Resource group | `soyl-forms-staging-rg`, Central India |
| Web application | `soyl-forms-web`, Container Apps Consumption, 0.5 CPU/1 GiB, min 1/max 3 replicas, HTTP concurrency 20 |
| Application image | `soylformsn4nsiocbpshei.azurecr.io/soyl-forms@sha256:4ab147c71af1f490920eaf2f1b5631e8df94853175f81fe8faae53a7f94876c9` |
| Current revision | `soyl-forms-web--billing-20261012050738` |
| PostgreSQL | `soyl-forms-pg-n4nsiocbpshei`, PostgreSQL 17, B1ms, 32 GiB, private network only, 7-day PITR, no HA |
| Schema | Azure migrations `0001` through `0027`; immutable SHA-256 migration history and advisory locking |
| Migration image | Same immutable digest as the application; migration command runs before web rollout |
| Database credentials | Separate migration owner and restricted runtime role; verified TLS; runtime pool max 3/process |
| Jobs | Outbox every minute; cleanup at minute 7 each hour, UTC. Separate scheduler identity, CRON secret only |
| Provider storage | Existing private R2 bucket; staging CORS added while preserving existing production origins |
| Billing | Live Razorpay credentials and four live plans validated against application pricing. The existing production webhook subscribes to all ten subscription lifecycle events; other hooks preserved. Actual checkout acceptance remains pending |
| Customer identities | Dedicated SOYL Forms Entra External ID tenant; email/password. Google deferred |
| Secrets | Key Vault references with per-secret managed identity grants. No owner database URL in the web application |
| Logs and budget | 30-day Log Analytics retention, 0.1 GiB/day ingestion cap; INR 7,000/month budget with actual/forecast alerts, including managed environment RG |

Migration execution `soyl-forms-migrate-3qoectz` succeeded with all 27 immutable migration checksums. Main-branch release `38084138577` at commit `568e880` passed both CI jobs, applied migrations before rollout, and verified revision 7 readiness and login on 10 October at 20:38 UTC. Readiness refuses to serve this application against an older schema. Source Supabase migrations remain unchanged. Azure builds select `NEXT_PUBLIC_BACKEND=azure`; the legacy production build still defaults to Supabase.

Production release `38141513869`, attempt 2, at main commit `9aa48cc` succeeded on 11 October. Managed certificate `mc-soyl-forms-env-forms-soylai-com-7827` is SNI-bound to `forms.soylai.com`; both application origins are `https://forms.soylai.com`, and the image is built for native scheme `com.soylai.forms`. Migration execution `soyl-forms-migrate-x6nkaju` succeeded before revision 8 rolled out. The first release attempt stopped at the certificate gate while binding was still pending, before any image build, migration or app rollout; only the failed release job was rerun after HTTPS readiness passed.

The migration covers creator/dashboard/builder operations, public submissions/progress/resume/uploads, responses/CSV, brands, team permissions, operator tools, subscriptions/payment collection/credit packs, AI credit accounting, MCP, outbox and cleanup. Typed repositories use parameterized queries and transaction-local user context. Published versions remain immutable. Sensitive public/worker operations use narrowly granted SQL functions; ordinary runtime queries do not bypass RLS.

## Verification evidence

| Check | Result and limit |
| --- | --- |
| Regular regression suite | 309 passed, 22 opt-in PostgreSQL tests skipped; typecheck and lint passed, including directory-deletion and Azure email retry regression tests |
| Real PostgreSQL | All 22 auth/platform/admin-bootstrap integration tests passed, including restricted runtime authorization, cross-workspace access, concurrent quotas/invitations, immutable publications, lease fencing, MCP, billing accounting and durable deletion. Fifty concurrent calls on a shared rate key admit exactly twenty |
| CSV | More than 10,000 rows streamed and checked for complete output, tags and final row; repeatable-read snapshot, bounded cursor chunks and cancellation cleanup |
| Azure image | Full Next.js production build passed in Docker; runtime runs as a non-root user |
| Staging HTTP smoke | Execution `soyl-forms-verification-19hq170` succeeded: real SSR, progress, resume save/read/invalidation, retry-safe submission, actual R2 PUT/verification/attachment, anonymous private download denied and concurrent submissions |
| Smoke accounting | 4 seed + 12 acknowledged = 16 database rows = 16 usage. Free-response outbox drained; two test workspaces/users and the R2 test object removed |
| Directory provider | A dedicated generated customer fixture was created/deleted with real Graph application credentials; deletion retry verified and all generated directory fixtures removed. In-app interactive deletion remains an acceptance gate |
| Azure email authorization | Execution `soyl-forms-email-verification-9yfroph` succeeded using the runtime managed identity: token acquired in 830 ms, invalid-payload validation response in 1,378 ms total, no email created |
| Real notification pipeline | Execution `soyl-forms-email-outbox-verify-cm25ix5` succeeded: deployed public form submission, paid-entitlement notification, persisted ACS operation `c1cff241-f936-4589-a5fa-d8748be71768` reported Succeeded, outbox completed, exactly one submission/one notification in usage. Fixtures removed at `2026-10-10T20:41:30Z`. Recipient authorized one message; no second sending test was run. Inbox/spam placement and separate delivery diagnostics remain unconfirmed |
| Cleanup | Actual scheduled-job execution `soyl-forms-cleanup-14f8gqx` succeeded against the deployed app |
| Sustained load | Execution `soyl-forms-verification-oa9qzp2`: steady 9,000/9,000 accepted, p95 34 ms/p99 101 ms; burst 3,000/3,000 accepted, p95 34 ms/p99 90 ms. Zero unexpected errors or rate-limit rejections in these phases |
| Load accounting | 10,000 seed + 12,052 unique acknowledged responses = 22,052 rows = 22,052 usage; checked at `16:45:31Z`. Outbox drained by `16:47:21Z` in scheduler logs and confirmed by the runner at `16:47:31Z`; all 100 synthetic users/workspaces and the test R2 object were removed at `16:47:32Z` |
| Billing plans | All four real Razorpay test plan IDs match application amount, INR currency and interval: Starter 199/month or 1,990/year; Pro 499/month or 4,990/year. No charge was made by this read-only check |
| Live billing configuration | On 12 October all four supplied live plans matched price, INR and interval. Read-only private DB preflight `soyl-forms-migrate-oysr8r6` found no provider-linked/paid/pending-checkout subscriptions or purchased credit ledger entries. Seven payment secrets were deployed through Key Vault. The supplied webhook signing value matched a public URL, so it was replaced with a random 32-byte secret; revision `soyl-forms-web--billing-20261012050738` became ready on the unchanged production image |
| Live billing runtime | After rotation at `2026-10-12T05:08:49.723Z`, an invalid signature returned 400; a correctly signed ignored operational event returned 200, and its duplicate was recognized. This verifies the deployed secret and duplicate accounting, without exercising a checkout or Razorpay-origin delivery. See [live billing runbook](26_azure_live_billing.md) |
| GitHub CI and release | Main commit `568e880`, run `38084138577`: both CI jobs and the OIDC deployment succeeded, including clean legacy/Azure builds, all 20 real PostgreSQL tests, strict cloud migrations, and new-revision readiness/login |
| Production release | Main commit `9aa48cc`, run `38141513869` attempt 2: both CI jobs succeeded, 22 actual PostgreSQL tests passed, immutable production image pushed, migrations succeeded and revision 8 became ready |
| Production HTTP/auth checks | At `2026-10-11T13:09:13Z`, HTTPS home/login/signup/demo/live/ready returned 200 with expected content-type protection. Anonymous admin requests redirected to login. Sign-in initiation used the production callback, dedicated tenant, PKCE and secure HttpOnly host cookie. Cross-origin logout returned 403; same-origin anonymous logout used the production return URI. This did not perform signed-in browser, payment or email acceptance; one short-lived auth transaction was created |
| Isolated hot-form check | Execution `soyl-forms-hot-form-verification-onijwl7` passed: 50 simultaneous requests to one form, 40 accepted/10 intentional 429s over two real source buckets, completed in 674 ms. Exact database/usage accounting, outbox drain and removal of two users/workspaces plus the R2 object passed |

The load runner seeds 100 labelled synthetic creator workspaces and 10,000 responses, exercises 50 simultaneous submissions, 5 submissions/second for 30 minutes and 10/second for five minutes, plus public page reads. It uses the actual deployed API and rate limiter. Requests originate in Azure Central India and are spread over 100 forms. This measures regional API throughput, not end-user browser latency or geographically distributed traffic to one hot form. The smoke test separately exercises ten concurrent submissions in the same workspace. Payment/provider and paid email throughput are outside the measured submission latency.

The load execution succeeded after exact accounting, outbox drain (approximately two minutes after the burst) and cleanup. Cloud logs showed a burst backlog of 513 at `16:45:29Z`, 38 at `16:46:25Z` and zero at `16:47:21Z`, with no terminal failures. The app scaled from one to two replicas during the combined concurrency checks. Database CPU in a five-minute window covering early burst traffic averaged 15.4%/maximum 25.5%; connections averaged 15.8/maximum 19. These are observed windows, not promised maximums or evidence of indefinite B1ms CPU-credit headroom.

Run `--hot` after other automated fixtures have been removed: the check compares newly created HMAC rate-bucket counts and deliberately refuses concurrent fixture runs. Azure job traffic used two outbound source buckets, so expecting twenty accepted requests across the entire runner would be incorrect; the actual gate is twenty per IP/form/minute. Early QA attempts exposed this test assumption and bucket interference from the ongoing distributed-form run; their fixtures were removed. The isolated retry verified the correct boundary without forged IP headers or an abuse-control bypass. This small burst is not a sustained single-form capacity guarantee.

Rolling updates from revision 2 to revision 3 during steady traffic and revision 3 to revision 4 near the end of the burst caused no observed failures in this run. This verifies these application rollouts, not all worker/provider crash cases.

## Backups and actual restore drill

Preserved source export: 29 tables/109 rows, including four old accounts, five forms, eight responses and one file reference. The REST export had matching double reads, but is **not an atomic PostgreSQL snapshot**. Take a final consistent export during a write freeze if importing at cutover. Archive and credentials remain in ignored local storage; neither customer data nor secrets belong in Git.

The one referenced R2 object was downloaded and verified using conditional ETag reads, a second HEAD, byte count and SHA-256. No source data/object was deleted. **On 11 October 2026 the owner selected a fresh Azure launch, leaving all old Supabase accounts, forms and responses in the archive. No legacy import or identity mapping will run.** Preserve the existing Azure owner identity and platform configuration; a fresh launch does not require dropping the already provisioned database. Do not merge identities by email automatically.

Actual Azure PITR drill:

1. Created temporary private server `soyl-forms-restore-20261010` from the staging source at the latest recovery point. Resource creation timestamp: `2026-10-10T15:53:00.379885Z`.
2. Ran `soyl-forms-restore-verification-4yaxlbi` using the migration and separate runtime credentials. It verified 23 matching migration checksums, the existing owner identity/session and a restricted runtime role; anonymous form reads returned no private data.
3. Verification completed at `2026-10-10T16:05:14.3885006Z`: approximately **12 minutes 14 seconds** from resource creation through validation.
4. Removed the temporary server after validation. The drill preceded migration 0024 and load fixtures; it does not prove restoration of the later 10,000-response dataset.

Recovery procedure: pause application writes and scheduler calls, restore to a separate private server on the same VNet/DNS configuration, validate checksums/data/role restrictions with `check-restored-database.mjs` adapted to the explicitly selected restore host, replay any compatible forward migrations, then update **both** migration and runtime Key Vault URLs to that server. Refresh secret references/create a new application revision, check readiness, verify a controlled write/read and scheduler, and only then resume traffic. Preserve the old server until reconciliation is complete. Record the recovery point and any writes after it; PITR does not guarantee zero lost writes. Key Vault secret rotation/reference refresh must be verified rather than assumed immediate.

## Worker and deletion behavior

The outbox claims one event with a lease, checkpoints each destination, freezes email provider requests/idempotency keys and caps retries. Default batch limit is 500, with a 30-second work budget; overridable from 1 to 1,000. This removed the old 25/minute ceiling. Provider timeouts still bound a last in-flight call beyond the budget. Free-response drain throughput does not establish Azure email/webhook throughput. Azure email uses persisted operation IDs, five-minute repeatability and separate throttling deferrals; see [email setup and exact DNS records](24_azure_email_and_dns.md).

Account deletion immediately disables application access and revokes sessions/API keys. A durable job cancels subscriptions, deletes private objects, removes the verified Entra directory object and then purges application PII. Completed stages survive retries. A Graph DELETE 404 is accepted only if a subsequent GET also confirms absence; real provider testing exposed a brief write/read replication inconsistency for newly created accounts. Existing sessions from before OID capture require signing out/in before deletion. Directory deletion is soft-retained by Microsoft's recovery policy; database backups expire on their retention schedule.

## Monitoring and response

`azure/platform-monitoring.bicep` provisions an action group for subscription Owners and these enabled alerts:

- DB CPU average above 70%/15 minutes, storage above 70%/5 minutes, connections maximum above 25/5 minutes.
- App CPU average above 70%/15 minutes, memory average above 80%/15 minutes, response-time **average** above 1,000 ms/15 minutes, more than five 5xx requests/5 minutes.
- Worker failure/lease loss, terminal delivery failures, oldest queued response above five minutes, account deletion above one day; no successful outbox heartbeat in five minutes.

Thresholds use actual available Azure metric names/units. They do not implement the proposed p95/1% request SLO. External uptime, provider-specific payment failure alerting, CPU credit depletion, pool-wait/lock monitoring and a notification delivery drill remain operational work before a broad launch. Owner recipients are configured; receipt of an actual test alert has not been confirmed. Missing log ingestion can trigger the heartbeat alert, including when the daily ingestion cap is reached. Monitor the cap and actual costs before reducing visibility or raising limits.

On an alert, inspect readiness, revision health, database CPU/connections/storage, scheduler executions and structured queue counts. Avoid printing provider bodies, answer payloads or secrets into incident logs. A backlog with healthy submissions calls for worker/provider investigation; do not disable paid submissions automatically. When the DB is healthy and the app is saturated, tune app resources/concurrency first. For persistent DB pressure/CPU credit depletion, move to B2s for intermittent load or General Purpose for sustained load and rebenchmark. Maintain a connection budget below 30 on B1ms, including overlapping revisions/jobs/operators. See `21_azure_migration_plan.md` for scaling and break-even assumptions.

## Delivery and remaining launch gates

CI runs the regular checks and a separate PostgreSQL 17 service job that applies migrations twice, creates the restricted role, executes the real database tests and builds the Azure target. `azure-staging.yml` provides a serialized preview release using Azure OIDC, with access restricted to registry push and web/migration updates and no direct Key Vault reads. It refuses deployment after the shared app has switched to the production origin. Use `azure-production.yml` for future releases; its separate environment permits main, shares the release concurrency lock, verifies DNS/certificate readiness and requires migrations to succeed before app rollout. Production release `38141513869` passed these gates; provider and interactive acceptance remain separate.

Remaining launch acceptance after the production domain cutover:

1. Data decision resolved: launch fresh; retain the source Supabase data, local export and verified R2 backup without importing them. The designated initial administrator grant succeeded on 11 October 2026, with the restricted runtime gate and anonymous denial verified; see [bootstrap evidence](25_azure_superadmin_bootstrap.md). Sign in on the production domain and confirm the owner can open `/super-admin`; preview-domain cookies do not transfer.
2. Azure Communication Services Email is provisioned in India with a dedicated managed-identity grant. The real single-notification pipeline and accounting passed using the Azure-managed sender. On 11 October the custom domain passed Domain/SPF/DKIM/DKIM2 verification, the custom sender was configured and the new app revision became ready. Confirm custom-sender inbox placement, request the required email quota, then complete respondent/invitation receipt and delivery/bounce monitoring. No Resend key is needed for the Azure target. Initial custom-domain limits are 30/minute and 100/hour, subject to subscription quotas. ACS Email retires 30 September 2028; treat it as a temporary provider and follow the replacement deadlines in docs/24.
3. Complete password recovery, logout/re-login, explicit email verification observation, every interactive creator/form feature and real in-app deletion. The CLI operator lacks permission to inspect the Entra email OTP policy; a tenant administrator must verify/reset policy through the tenant's normal administration flow. Do not grant the runtime application policy-write permission for setup.
4. Test Android signup/login/recovery/logout/system-browser return and actual device forms/files/payments. A separate QA APK is available locally; no store release has occurred.
5. Live credentials, plan validation and production webhook configuration are complete. Complete controlled payment acceptance for subscriptions, cancellation, credit packs and form payments, including actual Razorpay-origin delivery, duplicate/out-of-order events and entitlement/accounting checks. Test-mode financial cases need an isolated test deployment; do not switch the production app back to test mode. No live checkout or charge has been performed by the operator; see [live billing runbook](26_azure_live_billing.md).
6. Sustained load, exact accounting/cleanup and a hot-form rate-limit burst passed. Complete worker restart recovery, real webhook/Sheets delivery and AI smoke; use geographically distributed hot-form tests when forecasting larger bursts. Capture the limits of each result.
7. Verify alert delivery/external uptime, review dependency findings, credit expiry and actual costs. The production CI release and DNS/certificate cutover are complete; resolve the remaining interactive/provider gates before a broad paid/store launch.

Production runtime dependency audit currently reports zero vulnerabilities. Seven high findings remain in development/build tooling through the braces dependency; the available force changes would change major toolchains and are not a safe unattended fix. Do not classify the entire dependency tree as clean.

Production DNS now targets Azure; the old Vercel deployment and Supabase source remain retained. Live payment configuration completed on 12 October; financial and provider delivery acceptance remain pending. After new Azure writes exist, rollback to stale Supabase would require reconciliation; prefer a compatible prior Azure app revision or a forward fix. An older preview-origin build is not a compatible production rollback without rebuilding/reconfiguring its origin. Migration rollback is not automatic.
