# Azure live billing configuration

Verified 12 October 2026. The owner supplied the seven payment settings in ignored `.env.azure.payments.local` and authorized deployment. Production is `https://forms.soylai.com`; frontend and API run in Azure Container Apps.

## Deployed state and evidence

All four plans were fetched with the supplied live API credentials and checked against `lib/plans.ts` before any provider mutation:

| Plan | Monthly | Yearly | Currency and recurrence |
| --- | --- | --- | --- |
| Starter | INR 199 | INR 1,990 | INR, interval 1, monthly/yearly respectively |
| Pro | INR 499 | INR 4,990 | INR, interval 1, monthly/yearly respectively |

Private read-only preflight execution `soyl-forms-migrate-oysr8r6` succeeded at `2026-10-12T04:54:46.1911702Z`. It found zero subscriptions with a provider ID, paid plan/status or unexpired checkout, and zero purchase entries in `ai_credit_ledger`. No database changes or persistent migration-job template changes were made. This checks Azure application state; it is not an inventory of historical transactions in the Razorpay account.

Deployment `platform-live-billing` succeeded using the existing secure Bicep secret deployment. Only these seven Key Vault secrets were updated:

- `razorpay-key-id`, `razorpay-key-secret`, `razorpay-webhook-secret`
- `razorpay-plan-starter-monthly`, `razorpay-plan-starter-yearly`
- `razorpay-plan-pro-monthly`, `razorpay-plan-pro-yearly`

The runtime identity retains per-secret access. Previous versions were pinned before writing the new values; the application now references all seven new versions. A post-rollout readback compared every pinned Key Vault value with the supplied settings and verified all seven application environment references; all matched. The ignored infrastructure parameter file was synchronized for future deployments. Credentials are excluded from Git and the Docker build context.

Ready revision after signing-secret correction: `soyl-forms-web--billing-20261012050738` (superseding initial billing revision `soyl-forms-web--billing-20261012045821`). The production image remains `soylformsn4nsiocbpshei.azurecr.io/soyl-forms@sha256:4ab147c71af1f490920eaf2f1b5631e8df94853175f81fe8faae53a7f94876c9`. Both application origins remain `https://forms.soylai.com`. No application image or schema change was required for this configuration rollout.

The existing active live webhook `TdmzKPtjKLVoRj` at `https://forms.soylai.com/api/webhooks/razorpay` was expanded from three to ten subscription events: authenticated, activated, charged, pending, halted, cancelled, completed, paused, resumed and updated. The credential scan then detected that the supplied signing secret matched a public URL. It was replaced with a cryptographically generated 32-byte random secret in the ignored local file, Key Vault and the provider webhook. Other webhooks, existing enabled extra events and the target's alert email were preserved. The helper now rejects public URLs and secrets shorter than 32 characters before any provider mutation, and uses the webhook PUT endpoint documented by the [official Razorpay Node SDK](https://github.com/razorpay/razorpay-node/blob/master/lib/resources/webhooks.js).

After rotation, at `2026-10-12T05:08:49.723Z`, the deployed endpoint rejected an invalid signature with HTTP 400, accepted a correctly signed `deployment.verification` marker with HTTP 200 and `ignored: true`, then recognized the same event ID with `duplicate: true`. A separate request signed with the retired public value was rejected with HTTP 400. Readiness returned HTTP 200. Two ignored operational markers remain from the initial and corrected verification runs. No order, subscription, payment, charge, entitlement or email was created. This verifies the new runtime webhook secret and durable duplicate handling; it does **not** establish actual Razorpay-origin delivery, checkout success or settlement.

## Repeating configuration safely

Run from the repository root with Node 22 and the Azure CLI signed into the SOYL subscription. The helpers assume this deployment's existing ignored `.azure-migration` directory and infrastructure parameter file. Never print or commit those files. Default inspection makes only provider reads:

```powershell
node --env-file=.env.azure.payments.local scripts/azure/configure-live-billing.mjs
```

Before changing payment accounts or test/live mode, repeat the read-only private-database preflight and reconcile any provider-linked subscriptions, purchased credits and open checkouts. The deployment helper does not perform this preflight automatically. Preserve existing Key Vault version references and capture the current webhook configuration. A provider webhook GET cannot recover the old signing secret.

After that preflight, deploy the seven settings. The PowerShell helper validates the live plans again and prepares the secure parameter input:

```powershell
powershell -NoProfile -File scripts/azure/configure-live-billing.ps1
```

Wait for its new revision to equal `latestReadyRevisionName`; check production readiness and login. Then apply the exact production webhook and run the noncharging runtime probe:

```powershell
node --env-file=.env.azure.payments.local scripts/azure/configure-live-billing.mjs --apply-webhook
node --env-file=.env.azure.payments.local scripts/azure/verify-live-billing.mjs
```

The provider helper validates all four plans before mutations, requires the prepared inputs and target webhook ID to remain unchanged, refuses ambiguous/truncated webhook inventories and restricts provider writes to webhook configuration. It preserves other hooks. The runtime probe leaves one ignored audit marker per run and makes no financial transaction. Evidence is saved only in ignored `.azure-migration` files.

If a stage fails, inspect that stage and reconcile before continuing. This sequence is not an atomic transaction across Azure and Razorpay; do not assume a new app revision alone restores a provider signing secret. Secret rotation also affects retries: [Razorpay requires the old secret for older retried events](https://razorpay.com/docs/webhooks/validate-test/). The app currently accepts one configured signing secret. Reconcile outstanding provider deliveries before rotation; retain the prior secret securely if retry handling is needed. Do not disable signature verification.

## Remaining payment acceptance

An authorized owner must complete a controlled checkout before public paid launch. Verify the subscription in Razorpay and the application, exact plan/interval/amount, signed provider delivery, entitlement changes and usage accounting; then verify cancellation behavior. Exercise credit packs and payment-enabled forms separately, including failed/abandoned checkout, duplicate and out-of-order events. Use isolated test-mode infrastructure for destructive/failure scenarios. A live payment requires explicit payment authorization; no financial transaction was performed during this deployment.

The broader remaining launch gates, including email receipt/quota, production signed-in UI, monitoring and Android acceptance, are tracked in [the platform runbook](23_azure_platform_staging.md).
