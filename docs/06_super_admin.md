# Super-Admin Specification

## 1. Purpose

The super-admin is the operator console for the entire SaaS. It is separate from customer workspaces and must never be reachable merely by changing a client-side route.

Suggested route: `/super-admin`.

## 2. Authorization

Access requires:
- authenticated user
- server-side role check against `admin_users` or a secure server configuration
- every admin page/action re-checks authorization server-side

Do not store `is_super_admin=true` only in browser local state or editable profile metadata.

## 3. Overview dashboard

Cards:
- total users
- new users 7d/30d
- active workspaces
- published forms
- submissions today / 7d / 30d
- free vs paid workspaces
- MRR estimate from active subscriptions
- storage used
- webhook failure rate
- flagged/suspended forms

Charts should remain simple.

## 4. User management

Search by:
- email
- user ID
- display name

User detail:
- profile
- workspaces
- plan
- forms
- usage
- account created date
- last activity if available
- admin/audit events

Actions:
- suspend user/workspace
- reactivate
- view relevant forms
- do not expose password information

Avoid impersonation in V1. If added later, require explicit visible mode, short expiry and audit logs.

## 5. Workspace management

List:
- owner
- plan
- status
- active forms
- monthly responses
- storage
- subscription state

Actions:
- suspend/reactivate workspace
- apply temporary manual entitlement override with expiry and reason
- view subscription provider IDs

Every manual override requires audit log.

## 6. Form moderation

Search:
- form ID
- slug
- title
- workspace

View:
- publish status
- response counts
- storage
- abuse flags
- public URL

Actions:
- force close public form
- suspend for abuse
- reactivate
- never silently edit the customer's questions in V1

## 7. Billing view

Display:
- workspace
- internal plan code
- Razorpay subscription ID
- subscription status
- billing interval
- current period
- last webhook event

Do not provide ad-hoc "mark paid" buttons without a deliberate override model. Provider webhooks remain the normal source of truth.

## 8. Usage and cost dashboard

Important because this is a low-cost SaaS.

Track:
- submissions by workspace
- storage by workspace
- emails sent
- webhook attempts
- top usage workspaces
- forms with suspicious bursts

## 9. Abuse management

Basic signals:
- extreme submission velocity
- upload spikes
- repeated Turnstile/rate-limit failures
- forms reported by users if report feature is added

Admin can suspend a form without deleting evidence/data.

## 10. Platform configuration

Feature flags:
- registrations enabled
- file uploads enabled
- new paid upgrades enabled
- AI beta later
- custom domains beta later

Plan definitions should primarily live in versioned code, but admin may view them. Avoid letting a typo in an admin form rewrite pricing globally without deployment/review.

## 11. Audit logs

Record:
- admin login-sensitive actions
- suspend/reactivate
- entitlement override
- data deletion requests/actions
- billing overrides if ever allowed

Include actor, target, action, timestamp, and reason/metadata. Do not log raw form answers unnecessarily.
