# AI Coding Agent Rules — Non-Negotiable

These rules override convenience shortcuts.

## 1. Read before coding

Read the full build pack first. Do not start by generating a generic SaaS template without understanding form versioning, tenant isolation and public submission flows.

## 2. Do not overengineer

- one application repository
- no microservices
- no NestJS backend in V1
- no Kafka/Redis unless a measured requirement appears
- no complex event architecture before needed

## 3. Do not underengineer security

Never:
- expose Supabase service role
- authorize using client-supplied workspace ID alone
- implement super-admin as a frontend boolean
- make private R2 uploads permanently public
- accept raw HTML/JS from creators
- trust Razorpay browser success as subscription source of truth

## 4. Tenant isolation first

Every creator-owned query/mutation must have explicit workspace authorization. When uncertain, deny.

## 5. Database migrations only

All DB changes must be committed as SQL migrations. Do not instruct the human to click around Supabase to create tables manually unless it is provider configuration that cannot reasonably be versioned.

## 6. Server validation

Every mutation/public submission must validate input server-side even if UI already validates it.

## 7. Form schema

- keep `schemaVersion`
- stable block/question IDs
- validate before save/publish
- published versions immutable
- answers keyed by stable question ID

Do not normalize every block into dozens of database rows in V1.

## 8. Shared renderer

Builder preview and public runtime should use the same underlying renderer/block components. Do not implement two independent form engines.

## 9. Plan enforcement

All paid/free limits must be enforced on server. UI gating is secondary.

Plan values come from centralized config. Do not scatter literals like `2`, `250`, `5000` throughout the codebase.

## 10. Razorpay

- all secret operations server-side
- webhook raw-body signature verification
- webhook idempotency
- tolerate duplicate/out-of-order events
- test mode before live mode

## 11. Public form performance

Do not ship dashboard/admin JavaScript to respondent routes.

Avoid heavy dependencies on `/f/[slug]`.

## 12. UX quality

Do not consider a feature done because CRUD works.

Public form requirements:
- responsive
- keyboard accessible
- smooth but subtle motion
- clear validation
- loading/error/closed states
- preserves answers across navigation

## 13. No fake functionality

Do not render buttons that do nothing, fake charts, placeholder analytics values, fake payments or fabricated response data in production views.

Seed/demo data must be clearly development-only.

## 14. No TODO graveyard

A phase may intentionally defer a feature, but committed V1 paths should not contain TODOs for critical security/data behavior.

## 15. Error handling

Every external provider call must have:
- timeout/failure handling where relevant
- structured error logging
- user-safe error message

Never leak provider secrets/stack traces to users.

## 16. Coding standards

- TypeScript strict
- descriptive types
- avoid `any` except narrow documented boundaries
- small composable components
- business logic outside React components where practical
- accessibility by default
- format/lint/typecheck green before marking phase complete

## 17. Implementation discipline

At the end of each phase:
1. run tests/typecheck/build
2. summarize files changed
3. list migrations/config required
4. list remaining known issues
5. do not silently move to the next phase if current acceptance criteria fail

## 18. Current docs over memory

For provider integrations (Cloudflare, Supabase, Razorpay), use current official documentation at implementation time. APIs and recommended adapters can change.
