# Azure email and production DNS

Updated 11 October 2026. Azure Communication Services Email replaces Resend in the Azure deployment. Microsoft Entra continues to handle signup/recovery messages separately. No email provider key is required: the web app uses its SOYL Forms user-assigned managed identity, granted a custom role on this communication service only.

## Service retirement and replacement deadline

Microsoft announced on 23 September 2026 that **ACS Email retires on 30 September 2028**. The current resource can be used during the transition, but Microsoft recommends against onboarding new long-term workloads. New-resource availability can change; email quota increases are reviewed case by case. See the [official retirement guide and email FAQ](https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide#acs-email).

Treat this implementation as a temporary provider integration. Select a successor by 30 September 2027 and complete provider/DNS/delivery acceptance by 31 March 2028, leaving six months before retirement. Keep the provider boundary, frozen reservation metadata and retry rules; never replay an uncertain Azure operation through a replacement provider. The app, PostgreSQL and Entra architecture does not depend on ACS Email. Microsoft 365 HVE currently serves internal recipients and is not a replacement for external customer notifications; Exchange Online has mailbox and tenant limits. Evaluate an external transactional provider or an appropriate Azure Marketplace offering before replacement, including whether shared credits cover it.

## Provisioned service

- Resource group: `soyl-forms-staging-rg`.
- Email resource: `soyl-forms-email`; communication resource: `soyl-forms-communication`.
- Data location: India. Engagement tracking disabled.
- Endpoint: `https://soyl-forms-communication.india.communication.azure.com`.
- Initial verified sender: `DoNotReply@38e8f081-bf10-4d27-8975-cab4f8627740.azurecomm.net`.
- Custom sender prepared: `notifications@mail.forms.soylai.com`, display name SOYL Forms. Verification pending DNS.
- Provider send/status diagnostics target the existing 30-day Log Analytics workspace. These logs can contain recipient addresses; restrict access and apply the documented retention policy. Engagement-event logging remains disabled.

Deploy/configure with `powershell -File scripts/azure/configure-email.ps1`. Once all custom-domain records are verified, run it with `-UseCustomDomain`. The script refuses to switch to an unverified domain. `azure/platform-app.bicep` accepts `emailEndpoint` to retain managed-identity email configuration during infrastructure deployments.

The Azure-managed domain is suitable for testing: its current fixed send limits are **5/minute and 10/hour**. Verified custom domains initially allow **30/minute and 100/hour**, subject to subscription quotas. Request increased custom-domain limits before launching notification volume beyond these limits; another resource does not bypass subscription quotas. Provider throttling defers queued mail rather than exhausting five failure attempts. A 24-hour ceiling bounds deferred jobs. Submission acknowledgments do not wait for email delivery.

## Retry behavior

Migrations 0025–0027 persist the provider operation UUID and first-send timestamp before contacting ACS. Only the SQL call that creates that UUID returns a fresh-operation flag, allowing the initial POST before any status lookup. Every subsequent call polls the persisted operation; a successful operation can recover a lost SQL checkpoint. This matters because actual authenticated lookups of never-sent UUIDs returned HTTP 504 after about 30 seconds, while an invalid send payload returned HTTP 400 in under a second. A worker crash after UUID creation never grants another fresh flag. Both ACS repeatability headers remain unchanged when retrying the original POST. ACS tracks repeatable requests for five minutes; after a conservative 4.5-minute boundary the worker only polls, never blindly sends again. A missing operation then becomes an operator-visible terminal uncertainty.

Only an explicit send HTTP 429 permits a new operation after the persisted retry time; a status-poll 429 preserves the original operation. Running operations and throttling defer processing without spending the ordinary error-attempt budget. Request, sender and provider endpoint remain frozen. Legacy reservations retain Resend semantics instead of being silently sent through the new provider.

`Dockerfile.email-verification` and `azure/email-verification-job.bicep` run the real provider module using the application identity. Default verification authenticates and submits an empty invalid payload without a sender or recipients; the expected validation rejection creates no email. It also checks that the module refuses an expired fresh operation. Explicit `--send` additionally requires an authorized `EMAIL_TEST_RECIPIENT`; provider success does not prove inbox receipt. The outbox verification job instead creates one labelled temporary paid-entitlement/form fixture, submits through the deployed API and checks provider success, job completion and exact submission/email accounting before deleting its fixtures. Run only one sending test per authorization. Real creator/respondent notifications, invitation receipt and bounce/delivery monitoring still require acceptance.

On 11 October 2026, main commit `568e880` deployed as healthy revision 7 after strict verification of all 27 migrations in release `38084138577`. Authorization execution `soyl-forms-email-verification-9yfroph` succeeded without sending. The single authorized sending test, `soyl-forms-email-outbox-verify-cm25ix5`, submitted through the deployed form API and verified ACS operation `c1cff241-f936-4589-a5fa-d8748be71768` as Succeeded, completed outbox state, and exactly one response/one notification in usage. Its temporary workspace, user and form were removed at `2026-10-10T20:41:30Z`. No additional message was sent. Inbox/spam placement remains owner acceptance; do not equate provider success with confirmed inbox delivery.

## GoDaddy DNS records

Authoritative nameservers are `ns71.domaincontrol.com` and `ns72.domaincontrol.com`. The connected Cloudflare account has no `soylai.com` zone. GoDaddy host names below are relative to `soylai.com`. Use the existing DNS account; do not change nameservers or modify other company projects.

Add these email records (TTL 3600; CNAMEs must not be proxied):

| Type | Host | Value |
| --- | --- | --- |
| TXT | `mail.forms` | `ms-domain-verification=0ef0dfb2-a4f5-4bef-833e-62c168dffe1e` |
| TXT | `mail.forms` | `v=spf1 include:spf.protection.outlook.com -all` |
| CNAME | `selector1-azurecomm-prod-net._domainkey.mail.forms` | `selector1-azurecomm-prod-net._domainkey.azurecomm.net` |
| CNAME | `selector2-azurecomm-prod-net._domainkey.mail.forms` | `selector2-azurecomm-prod-net._domainkey.azurecomm.net` |
| TXT | `_dmarc.mail.forms` | `v=DMARC1; p=none` |

Do not create a second SPF policy at the same host if one already exists: reconcile it first. The initial DMARC monitoring policy can be tightened after SPF/DKIM alignment is confirmed.

After propagation, initiate ACS verification for Domain, SPF, DKIM and DKIM2, check each reaches Verified, then enable the custom sender. Re-read verification records from Azure if the domain is recreated; verification tokens can change.

Production app records, to apply as part of coordinated cutover:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `asuid.forms` | `F4B43839CE331F2AB2B7A495A0BA61E2442268916A50C4643893CFF8C43B8EF5` |
| CNAME | `forms` | `soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io` |

The TXT ownership record can be added beforehand. **Do not switch the existing forms CNAME until the production application configuration, data decision, Entra callbacks and domain/certificate procedure are ready.** It currently targets `1feabb4b68b07b2a.vercel-dns-017.com`. Preserve that value for the pre-write rollback window. Azure managed certificate issuance requires correct public DNS and compatible CAA records. Once Azure accepts new writes, do not revert to stale Supabase without reconciliation.

## Production release procedure

The main-branch `azure-production.yml` workflow uses the separate `azure-production` GitHub environment and `soyl-forms-production-release` identity. The environment permits only main. Both release workflows share one concurrency group to prevent simultaneous deployments to the same lean application. Preview releases refuse a runtime that has already switched to the production origin.

Resolve data mapping and provider/user acceptance first. Register `https://forms.soylai.com` through `scripts/azure/set-identity-origin.ps1 -RegisterOnly` (already prepared during identity setup). Plan a brief cutover window: change the DNS records, run `scripts/azure/prepare-production-domain.ps1 -Bind`, then dispatch `gh workflow run azure-production.yml --ref main`. Certificate issuance can take several minutes. The domain script checks public CNAME and ownership TXT before changing Azure; check CAA authorization for DigiCert as well.

The workflow refuses deployment unless public DNS targets Azure, the custom domain has an SNI certificate binding and HTTPS readiness works. It then builds with the production origin and normal Android scheme `com.soylai.forms`, applies migrations before app rollout, sets both runtime origins to production and checks the new revision. Confirm actual login/form/payment/email flows afterward. This is a release procedure prepared for the authorized cutover, not evidence that production DNS or interactive acceptance is already complete.

When reapplying `azure/platform-app.bicep` after cutover, pass `appOrigin=https://forms.soylai.com` and `deploymentStage=production`; keep the deployed integration settings and email endpoint. The scheduler can continue calling the generated Azure hostname with its secret.

GitHub emits immutable IDs in this repository's OIDC subject: `repo:SOYL-AI@258314092/soyl-forms@1374943497:environment:azure-staging` (or `azure-production`). Both Bicep trust records use the observed format. The first release sign-in rejected the older name-only subject before making app/database changes; the trust was corrected without introducing a stored password or widening resource permissions.

The next release attempt stopped at strict migration checksum validation: migrations 0021, 0022 and 0023 were originally applied with CRLF bytes before Git normalization. They were extracted from the exact previously successful migration image `sha256:74a9f03069ca3cd71e710deebc59778ce0da5c423c06cafeb6875c4b5b976f69`; comparing all 24 files proved only those line endings differed, with identical SQL after LF normalization. Their exact original bytes are restored, and `.gitattributes` disables conversion for these three files only. No applied SQL content, stored history checksum or validator rule was changed. New migrations remain LF. Local strict verification passes all 26 files with the restored bytes.

## References

- [ACS repeatable requests](https://learn.microsoft.com/en-us/rest/api/communication/repeatable-requests)
- [Send email REST API](https://learn.microsoft.com/en-us/rest/api/communication/email/email/send?view=rest-communication-email-2023-03-31)
- [Get email operation result](https://learn.microsoft.com/en-us/rest/api/communication/email/email/get-send-result?view=rest-communication-email-2023-03-31)
- [Email service limits](https://learn.microsoft.com/en-us/azure/communication-services/concepts/service-limits#email)
- [Managed identity email authorization](https://learn.microsoft.com/en-us/samples/azure-samples/communication-services-dotnet-quickstarts/email-sample-send-email-with-managed-identity/)
- [Data residency](https://learn.microsoft.com/en-us/azure/communication-services/concepts/privacy)
- [GitHub OIDC subject formats](https://docs.github.com/en/actions/reference/security/oidc)
- [Container Apps managed certificates](https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-managed-certificates)
