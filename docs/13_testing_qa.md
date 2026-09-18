# Testing and QA

## 1. Philosophy

The most dangerous bugs are not visual. They are:
- cross-tenant data exposure
- duplicate/missing submissions
- billing entitlement errors
- broken public forms
- lost builder edits
- unsafe uploads

Prioritize those tests.

## 2. Test layers

### Unit tests
Test pure logic:
- schema validation
- conditional logic resolver
- plan entitlement checks
- usage calculations
- answer normalization
- CSV flattening
- QR URL construction
- webhook signature helpers

### Integration tests
Test database/server behavior:
- create workspace/form
- publish version
- submit form
- monthly usage increment
- plan limit refusal
- cross-workspace authorization blocked
- webhook idempotency

### E2E tests
Use Playwright or equivalent for:
1. signup/login test account flow where feasible
2. create form
3. add questions
4. publish
5. open public URL
6. submit
7. response appears in dashboard
8. QR URL corresponds to public form
9. upgrade test-mode billing flow at least through checkout creation/webhook simulation

## 3. Critical authorization cases

Must test:
- User A cannot open/edit User B form by ID
- User A cannot download User B file
- regular user cannot enter `/super-admin`
- changing workspace ID in request does not grant access
- service key is absent from client bundle

## 4. Form engine cases

- required short text
- email validation
- multiple choice
- back navigation preserves values
- conditional jump
- branch does not create loops (or loop detector prevents publish)
- deleted target rule is invalid
- keyboard Enter behavior
- reduced-motion mode

## 5. Submission reliability

- retry same idempotency key creates one submission
- two distinct keys create two submissions
- response limit enforced under concurrent requests
- form closed between load and submit is handled clearly
- form republished after respondent starts follows documented version policy

Recommended V1 version policy: a respondent session may submit the version it started if the form remains published/open and that version is recent/valid; otherwise clearly ask reload. Do not mix schema versions silently.

## 6. Billing

- forged client plan name cannot activate plan
- duplicate Razorpay webhook does not duplicate state transitions
- invalid signature rejected
- out-of-order events do not regress a newer valid state incorrectly
- cancelled plan downgrade does not delete forms
- free limit is enforced server-side

## 7. Upload tests

- unsupported MIME blocked
- oversize blocked
- forged R2 key blocked
- file for another form cannot attach
- orphan cleanup eligibility
- download requires workspace authorization

## 8. Accessibility QA

- entire public form completable by keyboard
- focus visible
- focus moves appropriately between question screens
- screen reader labels present
- 200% zoom remains usable
- mobile viewport with keyboard works
- `prefers-reduced-motion` honored

## 9. Performance targets

Aim, not absolute guarantees:
- public form first meaningful UI fast on typical 4G
- transitions remain 60fps on mid-range devices
- no enormous JS chart/editor bundle loaded into respondent page
- public form route should not load dashboard libraries

Use route-level code splitting naturally through Next.js.

## 10. Launch smoke checklist

Before production:
- production environment variables verified
- Razorpay live webhook configured
- webhook signature verification tested
- Supabase RLS tested
- backups decision documented
- R2 bucket private
- custom error pages
- legal placeholders replaced or clearly marked
- rate limiting enabled
- abuse contact/support path exists
- monitoring enabled
