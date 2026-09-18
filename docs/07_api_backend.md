# API and Backend Specification

## 1. General approach

Use Next.js Server Components, Server Actions and Route Handlers appropriately. Keep browser-exposed APIs narrow. Public submission and upload endpoints require explicit validation and abuse controls.

All inputs must be validated server-side with Zod or an equivalent schema library.

## 2. Suggested route surface

### Authenticated application
Prefer server actions for tightly coupled UI mutations where useful:
- create form
- update draft
- publish form
- archive form
- update theme/settings
- create/delete webhook

### Public endpoints
- `GET /api/public/forms/{slug}` only if renderer does not load through server component
- `POST /api/public/forms/{slug}/start`
- `POST /api/public/forms/{slug}/submit`
- upload initiation/finalization endpoints

### Billing
- `POST /api/billing/checkout`
- `POST /api/billing/cancel`
- `POST /api/webhooks/razorpay`

### Outgoing webhook testing
- `POST /api/forms/{formId}/webhooks/{webhookId}/test`

### QR
QR can be generated in-browser/server from the canonical URL; a dedicated API is not mandatory unless caching generated assets.

## 3. Public form fetch

Return:
- safe published schema
- theme
- public settings
- form ID/version opaque identifiers if required

Return no owner personal information.

## 4. Submission endpoint

Payload:
```json
{
  "formVersionId":"...",
  "idempotencyKey":"uuid-from-client",
  "answers":{},
  "hiddenFields":{},
  "sessionId":"...",
  "durationMs":42000
}
```

Server steps:
1. rate limit
2. resolve form by slug
3. confirm published/open state
4. confirm submitted version is acceptable/current for active session policy
5. validate answers against version schema
6. enforce plan/monthly response limit atomically
7. validate file references belong to this pending session/form
8. insert submission
9. increment usage counter in same transaction/RPC
10. create outbox events for email/webhook
11. mark visit completed
12. return submission ID and safe thank-you content

## 5. Atomic usage enforcement

Do not:
```text
SELECT count(*)
if under limit then INSERT
```
without synchronization; concurrent submissions can exceed limits unpredictably.

Use a PostgreSQL transaction/RPC that:
- locks or atomically updates current month usage row
- verifies limit
- increments usage
- inserts submission

Minor race-safe overage tolerance is acceptable only if deliberately designed. V1 should enforce cleanly.

## 6. Idempotency

Client generates a UUID for each final submission attempt.
Unique `(form_id,idempotency_key)` prevents duplicate records on retries.

If the same key is retried after success, return the prior successful result where possible.

## 7. Webhooks to customer endpoints

Recommended event:
`form.submission.completed`

Payload:
```json
{
  "id":"evt_...",
  "type":"form.submission.completed",
  "createdAt":"...",
  "data":{
    "formId":"...",
    "submissionId":"...",
    "submittedAt":"...",
    "answers":{}
  }
}
```

Signing:
- HMAC SHA-256 over raw body using per-webhook secret
- include timestamp header
- include event ID

Retry:
- bounded exponential backoff
- record attempts
- disable or alert after repeated failures rather than retry forever

## 8. File uploads

Preferred secure flow:
1. authenticated/anonymous respondent requests upload authorization for a specific form/question
2. server validates file type/size and form entitlement
3. generate short-lived signed upload path or proxy safely
4. object stored under randomized R2 key
5. finalize metadata
6. submission attaches file IDs
7. orphan cleanup deletes unattached files after TTL

Do not let client choose arbitrary R2 keys.

Suggested key structure:
`workspace/{workspaceId}/form/{formId}/{randomUuid}`

Never include respondent email/name in storage key.

## 9. CSV export

Export must:
- be workspace-authorized
- preserve one column per stable question ID/title
- include submission timestamp/id
- flatten simple values
- join multi-select with a documented delimiter
- expose file download references safely, ideally expiring links or file identifiers depending export strategy

For large exports, move to background generation later.

## 10. Rate limits

Apply separate policies for:
- auth endpoints (mostly provider-managed)
- public form fetch
- start event
- final submission
- file upload authorization
- admin actions

Use Cloudflare capabilities where appropriate plus application-level guardrails.

## 11. Logging

Log operational metadata, not answer payloads by default.

Good:
- request ID
- route
- duration
- form ID
- status
- error class

Avoid:
- raw answers
- uploaded file contents
- payment secrets
- authorization headers
