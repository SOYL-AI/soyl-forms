# Product Flows

## 1. New user flow

```text
Landing page
  -> Sign up
  -> Email verification / OAuth
  -> Create default personal workspace
  -> Empty dashboard
  -> CTA: Create your first form
  -> Choose Blank Form (templates later)
  -> Builder opens with Welcome + first question + Thank You
```

Do not force billing details during signup.

## 2. Form creation flow

```text
Dashboard
  -> New Form
  -> Name form
  -> Builder
      left: question outline
      center: live respondent preview
      right: settings for selected block
  -> autosave continuously
  -> Preview full-screen
  -> Publish
  -> Share modal
      URL
      Copy link
      QR code
      Embed snippet
```

## 3. Builder interaction flow

Selecting a block exposes settings appropriate to its type.

Common settings:
- question/title
- description
- required
- placeholder
- validation
- button label

Choice settings:
- choices
- allow other
- randomize later

Logic settings:
- default next block
- conditional jump rules

The builder must prevent invalid publish states such as duplicate question IDs, missing choice options or a logic jump to a deleted block.

## 4. Publish flow

When Publish is clicked:
1. validate form locally for immediate feedback
2. validate again server-side
3. enforce active-form plan limit if this is a first publish/reactivation
4. generate immutable form version
5. ensure unique public slug exists
6. set form status `published`
7. return canonical URL
8. show share dialog with QR

Publishing an edit creates a new version, not destructive mutation of historical versions.

## 5. Respondent flow

```text
Open /f/{slug}
  -> optional welcome screen
  -> start
  -> one screen per question/content block
  -> keyboard/touch answer
  -> validate current answer
  -> next transition
  -> conditional logic chooses next block
  -> final Submit
  -> server validates + stores
  -> success / thank-you screen
```

Keyboard rules:
- Enter advances when safe
- Shift+Enter creates newline in long text
- number keys may select options when unobtrusive
- Tab navigation remains accessible
- Escape must not destroy progress

## 6. Mobile flow

The mobile renderer is first-class, not a compressed desktop view.

Rules:
- no horizontal overflow
- large touch targets
- account for mobile keyboard viewport resizing
- sticky Next/Submit control when necessary
- retain answer when keyboard opens/closes
- avoid gesture-only interactions

## 7. Submission error flow

If network submission fails:
- retain answers in memory/local temporary state
- show clear retry action
- do not clear answers
- use idempotency key so repeated retries do not create duplicate submissions

## 8. Response review flow

```text
Dashboard -> Form -> Responses
  -> table/list of submissions
  -> filter by date / status
  -> open submission detail
  -> human-readable answers
  -> download uploaded files via authorized signed URL
  -> CSV Export
```

## 9. Plan upgrade flow

```text
Usage/Billing
  -> Choose Starter or Pro
  -> monthly/yearly
  -> create Razorpay subscription server-side
  -> launch Razorpay checkout
  -> user authorizes recurring payment
  -> immediate client verification where applicable
  -> webhook remains source of truth for subscription lifecycle
  -> subscription entitlement becomes active
```

Do not grant durable paid access solely because the browser says payment succeeded.

## 10. Limit reached flow

### Active form limit
User may keep existing published forms. Prevent publishing another active form; allow drafts. Show upgrade CTA.

### Monthly response limit
Recommended behavior:
- warn at 80%
- warn strongly at 95%
- at 100%, stop accepting additional submissions with a polite owner-configurable closed/limit message
- do not silently accept billable overage in V1

### Storage limit
Reject new uploads before accepting a file that would exceed quota. Other non-file answers continue to function.

## 11. QR flow

```text
Share -> QR
  -> show QR for canonical public URL + ?src=qr
  -> download PNG
  -> download SVG
  -> copy URL
```

Analytics should classify `src=qr` as source `qr` without altering completion behavior.

## 12. Super-admin flow

```text
Super-admin login/authorization
  -> Overview
  -> inspect users/workspaces/forms/subscriptions
  -> search by email, form ID, workspace ID or Razorpay subscription ID
  -> view usage anomalies
  -> suspend abusive workspace/form
  -> inspect audit log
```

Destructive admin actions require confirmation and audit logging.
