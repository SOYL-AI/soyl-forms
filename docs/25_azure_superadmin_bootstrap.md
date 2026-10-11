# Initial Azure administrator

The owner selected a fresh database launch on 11 October 2026 and explicitly designated the initial superadmin account. Do not import legacy Supabase data or automatically join old identities. The Azure database already has the current platform schema; preserve its configuration and real signed-in account instead of dropping it.

Initial inspection `soyl-forms-admin-bootstrap-sbkq4fw` found one application user, zero forms, zero responses and zero administrators. The designated address initially did not match an application account or a local email/password identity in the dedicated Entra tenant; inspection made no database changes.

After the owner confirmed registration on 11 October 2026, inspection `soyl-forms-admin-bootstrap-wnivbmk` found exactly one active application account for the designated address and one identity from the dedicated tenant. An independent Graph lookup matched its object ID to the enabled registered email identity. Before the grant the database contained two real users, zero forms, zero responses and zero administrators; no old data was imported.

Grant execution `soyl-forms-admin-bootstrap-sksjqpy` succeeded at `2026-10-11T06:09:50Z`: `superadmin_grant_verified` reported `role=super_admin`, `changed=true`, `runtimeGateVerified=true` and `anonymousDenied=true`. The real restricted application database role recognized the grant and an anonymous transaction context had no admin role. Account IDs and operational evidence are retained in ignored storage. The owner still needs to open `/super-admin` in the signed-in browser to confirm interactive access; production DNS has not moved.

An earlier grant attempt remained read-only because ARM converted `string(applyGrant)` to `True` while the script accepts only lowercase `true`. The Bicep now emits explicit lowercase literals; the deployed value was checked before the successful execution. No authorization guard was relaxed. After saving evidence and confirming every execution was terminal, the temporary bootstrap job was deleted; the app, scheduler and migration job were retained.

## Procedure

1. Sign up/sign in with the designated address on the Azure preview. The callback creates the application user and records the verified OIDC issuer, subject and directory object ID. Do not create a fake application identity, supply a default password or send an invitation without separate authorization.
2. Deploy `azure/superadmin-bootstrap-job.bicep` with the current immutable application image and secure `email` parameter. The default `applyGrant=false` only inspects. Start the temporary `soyl-forms-admin-bootstrap` job and read its structured output. It does not print credentials or other users' addresses.
3. Independently check that the reported object ID is the active account registered for that address in the dedicated customer tenant. Require a unique application account and exactly one identity with the expected dedicated-tenant issuer and a nonempty subject/object ID. Entra may omit `email_verified`: do not interpret the email claim as ownership proof or create an automatic email allowlist. This is an explicitly authorized manual grant to inspected, pinned IDs.
4. Redeploy with `applyGrant=true`, `expectedUserId` and `expectedObjectId` pinned to the inspected and independently checked account. Start once. The script refuses different IDs, ambiguous users, inactive users, missing provider metadata or an unexpected database host. The local test mode is restricted to localhost with explicit `AZURE_DATABASE_TESTS=true`.
5. Confirm `superadmin_grant_verified`: the `admin_users` row is `super_admin`, the real restricted runtime role sees it through `platform.admin_role()`, and an anonymous transaction context sees no admin role. The grant writes an audit event, and rerunning the same grant does not add another grant audit entry. No schema migration, email-based account linking, new session or runtime privilege escalation is performed.
6. Save the inspect/grant evidence in ignored operational storage, verify the signed-in owner can open `/super-admin`, then delete only the terminal temporary bootstrap job. Never remove the scheduler, migration job or real owner account.

The grant persists through the production domain change because it is stored against the internal application user ID. `SUPER_ADMIN_EMAILS` is a legacy Supabase path; setting it does not grant Azure admin access. Existing sessions read the database role on each protected request, so refreshing the admin route is sufficient once the grant is confirmed.

## Validation

Two opt-in real PostgreSQL tests execute the actual bootstrap script: dry-run/mismatched-object rejection without writes, and a pinned grant with runtime/anonymous authorization checks, unaffected other users and idempotent audit accounting. The normal database CI job includes these tests alongside auth/platform tests.
