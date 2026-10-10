# Azure email and production DNS

Updated 11 October 2026. Azure Communication Services Email replaces Resend in the Azure deployment. Microsoft Entra continues to handle signup/recovery messages separately. No email provider key is required: the web app uses its SOYL Forms user-assigned managed identity, granted a custom role on this communication service only.

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

Migrations 0025/0026 persist the provider operation UUID and first-send timestamp before contacting ACS. Retries poll that operation; a successful operation can recover a lost SQL checkpoint. Both ACS repeatability headers remain unchanged when retrying the original POST. ACS tracks repeatable requests for five minutes; after a conservative 4.5-minute boundary the worker only polls, never blindly sends again. A missing operation then becomes an operator-visible terminal uncertainty.

Only an explicit send HTTP 429 permits a new operation after the persisted retry time; a status-poll 429 preserves the original operation. Running operations and throttling defer processing without spending the ordinary error-attempt budget. Request, sender and provider endpoint remain frozen. Legacy reservations retain Resend semantics instead of being silently sent through the new provider.

`Dockerfile.email-verification` and `azure/email-verification-job.bicep` run the real provider module using the application identity. Default verification authenticates and polls an expired nonexistent operation, and sends no email. Explicit `--send` additionally requires an authorized `EMAIL_TEST_RECIPIENT`; provider success does not prove inbox receipt. Real creator/respondent notifications, invitation receipt and bounce/delivery monitoring still require acceptance.

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

## References

- [ACS repeatable requests](https://learn.microsoft.com/en-us/rest/api/communication/repeatable-requests)
- [Send email REST API](https://learn.microsoft.com/en-us/rest/api/communication/email/email/send?view=rest-communication-email-2023-03-31)
- [Get email operation result](https://learn.microsoft.com/en-us/rest/api/communication/email/email/get-send-result?view=rest-communication-email-2023-03-31)
- [Email service limits](https://learn.microsoft.com/en-us/azure/communication-services/concepts/service-limits#email)
- [Managed identity email authorization](https://learn.microsoft.com/en-us/samples/azure-samples/communication-services-dotnet-quickstarts/email-sample-send-email-with-managed-identity/)
- [Data residency](https://learn.microsoft.com/en-us/azure/communication-services/concepts/privacy)
