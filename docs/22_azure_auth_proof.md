# Azure authentication proof

Status: implemented in isolation; real-provider/browser and Android acceptance are pending. The production platform still uses Supabase. Do not enable the new identity as the platform's primary auth until the proof passes and the application/database migration is complete.

## Dedicated resources

- Azure subscription: `f51e344a-8bea-45cb-a18b-506a27c7a031`.
- Resource group: `soyl-forms-staging-rg`, Central India.
- Customer identity geography: Asia Pacific.
- Tenant: `soylforms.onmicrosoft.com`, `47f0c7e0-77a5-4ae0-b3b4-b9b48269d014`.
- Web application: `bccc18ff-25c7-426e-827f-1ff928f98de9`.
- Signup/sign-in flow: `a92f765d-4754-4f6a-a158-18ddbbe2a86b`.

The identity tenant/application/flow and isolated preview foundation have been provisioned in Azure: B1ms PostgreSQL 17 with 32 GiB storage, seven-day backups and public access disabled; a dedicated VNet/private DNS zone; Container Apps environment; Basic container registry; Key Vault; separate runtime and migration managed identities; and a capped log workspace. The preview app is deployed and reports ready against the private database using its restricted runtime credentials. The identity migration job has applied the schema. A local isolated PostgreSQL 17 container also supports auth integration tests. The company's existing Azure projects are unchanged.

The subscription bills in INR. A separate INR 7,000/month budget named `soyl-forms-lean-launch` includes both `soyl-forms-staging-rg` and the platform-managed networking group `soyl-forms-managed-rg`. Actual-cost alerts at 50/80/100% and a forecast alert at 100% notify subscription Owners. This is an alert threshold, not a hard cap. The managed load balancer/public IP, registry, DNS, logging and PostgreSQL incur costs even while the proof app scales to zero. No full-platform production cutover or source-data migration has occurred.

Preview origin: `https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io`. The Entra callbacks are registered. The proof app is limited to 0-1 replicas; its middleware blocks unrelated platform APIs and sends other pages to the proof. Launch configuration (minimum 1/maximum 3 replicas) is pending acceptance. Runtime identity can read only its database/client/cookie secrets, while the migration identity alone can read database owner credentials and the role-management password. The container runs as UID 1001 and excludes local secret/backup files from its build context.

## Local proof

`scripts/azure/prepare-identity.ps1` configures the dedicated app, least-privilege OIDC consent and email/password user flow. It saves the client secret and independent cookie secret in ignored `.env.azure.local`; it refuses to overwrite existing secrets. The proof uses `openid-client` for PKCE/state/nonce/issuer/audience/signature checks and `iron-session` for encrypted HttpOnly cookies. Database sessions are revocable, expire after 30 days, and become invalid immediately when the application user is disabled. Provider access/refresh tokens are not persisted.

The current local proof origin is `http://localhost:3001`, because another process already owns port 3000. Start it with:

```powershell
npm run azure:dev -- --port 3001
```

Open `http://localhost:3001/auth/entra/proof`. Use **Continue to secure sign-in** to open the customer tenant's hosted login. This proof creates only an application identity/session, not a migrated platform workspace. Existing `/login` and `/dashboard` remain on the working Supabase platform.

To change the origin and register its callback without rotating secrets:

```powershell
./scripts/azure/set-identity-origin.ps1 -AppOrigin 'https://your-proof-host.example'
```

Restart the server afterwards. HTTPS is required outside localhost. The dedicated tenant's client credential expires six months after creation; replace it in the secret store before expiry. Do not reuse the proof secret for production without a deployment secret/rotation policy.

The local database helper starts `soyl-forms-auth-postgres` on **127.0.0.1:55433** with named volume `soyl-forms-auth-postgres-data`. Run `npm run azure:db:local` only for initial setup. For later starts use `docker start soyl-forms-auth-postgres`; credentials are already saved locally. The helper never deletes an existing database. Application credentials are non-owner, non-superuser and non-BYPASSRLS; the `soyl_auth` role can execute narrowly scoped identity functions and cannot read tables or run cleanup.

The source inventory found 4 auth accounts, 4 workspaces, 5 forms, 4 published versions, 8 responses, 5 partial responses, 1 uploaded file and existing billing/AI/audit records. Preserve and map these explicitly, even if they are internal accounts. Inventory is not a transactional backup.

Migrations live in `azure/migrations`, independently of the historical Supabase files. `npm run azure:migrate` uses only `DATABASE_MIGRATION_URL`, an advisory lock, checksummed history and a transaction per migration. Do not edit an already applied migration. Read-only inventory: `node --env-file=.env scripts/azure/inventory-supabase.mjs`; output is saved under ignored `.azure-migration/`. Inventory counts are not a backup or consistent snapshot. A source data backup and identity mapping are still required before conversion/cutover.

`Dockerfile.migrations` builds a separate job image from an immutable application image digest, copying only migration SQL and runner/bootstrap scripts. This permits bootstrap fixes without recompiling the web app. Bootstrap serializes role setup, checks existing runtime role privileges and changes only its password on subsequent runs: Azure's non-superuser administrator cannot reassert protected role attributes with `ALTER ROLE`. Unexpected privileged roles fail closed. Always push the image before deploying the job, and pass the resulting digest to `azure/proof-job.bicep`.

Current immutable images:

- Web: `soylformsn4nsiocbpshei.azurecr.io/soyl-forms@sha256:47f671c2e74be4b51ce29ef84e37a3b28bed5df218a35d3656eb8ee44e25173b`.
- Migration job: `soylformsn4nsiocbpshei.azurecr.io/soyl-forms-migrations@sha256:9242fea89039d8e03c9ec428fd45e0e90535be21e0389413a173776fa349b45d`.

## Google configuration

In the chosen Google Cloud project, create a **Web application** OAuth client for this tenant. Set the consent audience and publishing/test-user settings appropriately. The current [Microsoft Google federation instructions](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers) list these callback variants for this tenant:

```text
https://login.microsoftonline.com
https://login.microsoftonline.com/te/47f0c7e0-77a5-4ae0-b3b4-b9b48269d014/oauth2/authresp
https://login.microsoftonline.com/te/soylforms.onmicrosoft.com/oauth2/authresp
https://47f0c7e0-77a5-4ae0-b3b4-b9b48269d014.ciamlogin.com/47f0c7e0-77a5-4ae0-b3b4-b9b48269d014/federation/oidc/accounts.google.com
https://47f0c7e0-77a5-4ae0-b3b4-b9b48269d014.ciamlogin.com/soylforms.onmicrosoft.com/federation/oidc/accounts.google.com
https://soylforms.ciamlogin.com/47f0c7e0-77a5-4ae0-b3b4-b9b48269d014/federation/oauth2
https://soylforms.ciamlogin.com/soylforms.onmicrosoft.com/federation/oauth2
```

Follow the linked provider instructions for consent-domain configuration. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` locally to ignored `.env.azure.local`, then run `./scripts/azure/configure-google.ps1`. It configures the dedicated tenant and attaches Google to the Forms flow while retaining email/password. Never send the secret in chat. This script is prepared but has not been exercised against a real Google client yet.

## Android handoff

The WebView generates a random verifier, stores it in sessionStorage and opens the browser with its SHA-256 challenge. The browser completes OIDC at `/auth/entra/callback`, then returns a two-minute, one-use ticket through `com.soylai.forms://auth/entra-return` in production, or `com.soylai.forms.authproof://auth/entra-return` in the isolated preview. Only the originating WebView can redeem it by proving possession of the verifier. The database creates the session and consumes the ticket atomically. Deep links contain neither reusable provider tokens nor session credentials. Cold-start links are handled without repeatedly replaying the launch URL. If Android kills the WebView and loses its verifier, sign-in must restart safely.

Build a separate QA APK with `./scripts/azure/build-auth-proof.ps1`. It requires Java 21, uses package `com.soylai.forms.authproof` and its own return scheme, and saves the APK under ignored `.azure-migration/soyl-forms-auth-preview.apk`. It restores normal Capacitor assets and Java/server environment settings afterwards; release builds retain the production package/scheme. A portable [Microsoft Java 21](https://learn.microsoft.com/en-us/java/openjdk/download) toolchain was downloaded and SHA-256 verified under ignored `.azure-migration/toolchains/` for this build. The Docker preview uses build argument `NATIVE_APP_SCHEME=com.soylai.forms.authproof`; omit this override for production.

The preview APK has built successfully, installed on emulator `emulator-5554`, launched, and resolved the proof return intent to `com.soylai.forms.authproof/com.soylai.forms.MainActivity`. Generated source assets were restored to the normal production URL afterwards. This checks packaging and intent registration; it does not prove an interactive login or browser-to-WebView session transfer.

The existing Android HTTPS App Link `/auth/callback` does not intercept `/auth/entra/callback`, so the OIDC exchange stays in the browser that owns the transaction cookie. Test the hosted proof over HTTPS on a real Android device before replacing platform auth. Do not claim that the local browser proof or SQL tests prove device compatibility.

## Verification and acceptance

Automated coverage includes signed OIDC tokens and forged issuer/audience/state/nonce/signature/expiry, same-email account separation, redirect normalization attacks, expiry/revocation/disabled accounts, origin validation, raw-table privilege denial and app-bound single-use tickets. Real PostgreSQL tests exercise concurrent state consumption, concurrent identity resolution and concurrent native redemption using separate owner/runtime credentials.

Recorded on 10 October 2026:

- Full Vitest run: 280 tests passed; five opt-in PostgreSQL tests skipped in that run. The separate real PostgreSQL run passed all five integration tests.
- Typecheck and lint passed; the production standalone Docker build passed and runs as UID 1001 without local `.env` files. Android `assembleAuthProof` passed with Java 21.
- Live Azure HTTP proof passed: signed-out UI/privacy headers, dedicated Entra authorization with PKCE, HttpOnly transaction cookie, configured callback despite a forged forwarding header, forged-callback rejection and logout CSRF rejection. `/api/health/ready` returned 200 with `{"status":"ready"}`. Billing APIs returned 404 in the isolated preview; an unconfigured local container returned readiness 503.
- Initial Azure migration execution `soyl-forms-migrate-ljd2kiv` succeeded. A rerun exposed SQLSTATE 42501 on protected role attributes; the bootstrap fix was deployed, and executions `soyl-forms-migrate-7s36hbw` and `soyl-forms-migrate-szxkaze` both succeeded. The first fixed run also logged verification of the unchanged migration history.

Interactive acceptance remains unexecuted. Open the [hosted proof](https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io/auth/entra/proof) and record each result before enabling platform auth:

| Check | Required observed result | Status |
| --- | --- | --- |
| Signup and email verification | Verified hosted signup returns to the proof with the expected identity | Pending |
| Password login and recovery | Existing account signs in; recovery email and password reset work | Pending |
| Logout and re-login | Local session is revoked; subsequent login is successful | Pending |
| Google login and cancellation | Configured Google identity works; cancellation has a safe retry path | Awaiting Google OAuth client |
| Disabled account and session expiry | Existing sessions are denied after disablement/expiry | Database tests pass; hosted acceptance pending |
| Android password and Google login | System browser returns to the originating preview WebView with a session | Pending |
| Native replay/interception/cold start | Ticket cannot be reused or redeemed without verifier; lost verifier requires restart | Database tests pass; device acceptance pending |

```powershell
npm run ci
$env:AZURE_DATABASE_TESTS = 'true'
try { npm run azure:test:db } finally { Remove-Item Env:AZURE_DATABASE_TESTS }
```

Before phase 2 starts, record actual results for hosted signup/email verification, email/password login, recovery, logout/re-login, Google sign-in and Google denial/cancellation, expiry/disabled accounts, Android browser return, intercepted-ticket rejection and WebView/cold-start behavior. Browser automation currently has no connected browser; unit fixtures and live OIDC discovery are not substitutes for this acceptance gate. A connected browser or operator-assisted test and a real Google OAuth client are needed.
