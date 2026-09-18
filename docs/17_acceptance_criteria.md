# V1 Acceptance Criteria

V1 is complete only when all critical items below pass.

## Marketing and auth

- [ ] Public home/features/pricing pages render correctly.
- [ ] User can sign up, sign in and sign out.
- [ ] Signup creates a personal workspace exactly once.
- [ ] Authenticated routes redirect/deny correctly.

## Dashboard

- [ ] User sees only their workspace forms.
- [ ] User can create, rename, duplicate and archive a form.
- [ ] Form status and response count display correctly.

## Builder

- [ ] Add required V1 blocks.
- [ ] Edit titles/settings/options.
- [ ] Reorder blocks.
- [ ] Delete/duplicate blocks.
- [ ] Autosave indicates saving/saved/error.
- [ ] Preview uses production renderer behavior.
- [ ] Invalid schema cannot publish.

## Publishing

- [ ] Publish creates immutable version.
- [ ] Republish creates next version.
- [ ] Public slug resolves active published version.
- [ ] Historical submissions retain original version ID.

## Form runtime

- [ ] Mobile and desktop usable.
- [ ] Back/next works.
- [ ] keyboard interaction works.
- [ ] validation works server + client.
- [ ] conditional jump works.
- [ ] reduced-motion setting works.
- [ ] closed/limit state works.

## Submission

- [ ] Completed response is durably stored.
- [ ] Duplicate retry with same idempotency key does not duplicate.
- [ ] plan response limit is server-enforced.
- [ ] owner can see response in dashboard.
- [ ] CSV export matches visible data.

## QR/share

- [ ] Published form has copyable canonical URL.
- [ ] QR scans to correct form.
- [ ] PNG download works.
- [ ] SVG download works if included.
- [ ] embed snippet renders functioning form.

## Uploads

- [ ] size/type enforcement works.
- [ ] private object cannot be guessed/accessed publicly.
- [ ] authorized owner can download response file.
- [ ] quota is enforced.

## Billing

- [ ] Starter/Pro monthly/yearly checkout can be created in Razorpay Test Mode.
- [ ] verified webhook updates local subscription.
- [ ] invalid signature rejected.
- [ ] duplicate webhook safe.
- [ ] paid entitlements unlock only through server truth.
- [ ] downgrade preserves customer data.

## Super-admin

- [ ] regular user receives 403/redirect.
- [ ] admin can search users/workspaces/forms.
- [ ] admin can suspend/reactivate a form/workspace.
- [ ] admin actions are audited.
- [ ] admin can inspect billing IDs/status and usage.

## Security

- [ ] no server secrets in client bundle.
- [ ] cross-workspace resource access tests fail safely.
- [ ] tenant RLS enabled where applicable.
- [ ] public submissions rate-limited.
- [ ] unsafe creator content escaped/sanitized.

## Deployment

- [ ] production build passes.
- [ ] migrations run from repository.
- [ ] production app deployed.
- [ ] live Razorpay webhook configured before accepting real payment.
- [ ] basic monitoring/logging present.
