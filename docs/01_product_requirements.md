# Product Requirements Document

## 1. Product objective

Build a fast, beautiful, affordable form SaaS optimized for one-question-at-a-time conversational forms. The product should be useful internally even with zero external customers and should be inexpensive enough to keep running as a side project.

The product should not attempt to reproduce every Typeform/Jotform/Tally feature in V1. It should win on simplicity, interaction quality, low price, and practical sharing.

## 2. Core promise

A user must be able to:

1. Sign up.
2. Create a form.
3. Add and reorder questions.
4. Preview it live.
5. Publish it.
6. Get a shareable URL and downloadable QR code.
7. Receive responses.
8. Inspect individual responses and a simple summary.
9. Export submissions as CSV.
10. Upgrade through Razorpay when limits or premium features require it.

A respondent must be able to complete a form without creating an account.

## 3. Primary personas

### Creator
A student, founder, freelancer, small business, teacher, event organizer or internal team member who needs attractive forms without a high monthly SaaS bill.

### Respondent
A person opening a public form URL/QR code on mobile or desktop. The experience must require minimal cognitive effort.

### Platform super-admin
The platform operator who needs visibility into users, forms, subscriptions, usage, abuse, storage and operational health.

## 4. Product surfaces

### Public marketing website
Required pages:
- Home
- Features
- Pricing
- Examples/templates placeholder
- Login
- Sign up
- Privacy Policy placeholder
- Terms placeholder
- Contact/support placeholder

### Customer application
Required areas:
- Dashboard
- Forms list
- New form
- Form builder
- Form preview
- Publish/share
- Responses
- Analytics basics
- Integrations/webhooks
- Appearance/theme
- Form settings
- Account settings
- Billing and usage

### Form runtime
Public form experience at a stable route such as `/f/{slug}`.

### Super-admin
Separate protected namespace such as `/super-admin` with explicit authorization.

## 5. Question types for V1

Required:
- Welcome screen
- Short text
- Long text
- Email
- Number
- Phone
- URL
- Single choice
- Multiple choice
- Dropdown
- Yes/No
- Rating
- Opinion scale
- Date
- File upload
- Statement/content screen
- Thank-you screen

Each question may support where relevant:
- title
- description/help text
- required flag
- placeholder
- validation
- choices
- media/image URL in future-compatible schema
- internal stable question ID

## 6. Form capabilities

Required:
- drag-and-drop or keyboard reordering
- duplicate question
- delete question with confirmation/undo
- required field toggle
- live preview
- autosave draft
- publish/unpublish
- versioned publishes
- basic conditional jumps
- progress indicator
- custom button labels
- theme selection
- logo upload on paid plan
- respondent completion page
- closed form state
- submission limit
- optional close date
- prevent accidental double-submit
- hidden fields via URL query parameters
- CSV export
- outgoing webhook on completed submission

## 7. QR code feature

Every published form receives a QR code tied to its canonical public URL.

Requirements:
- QR visible in Share panel.
- Download as PNG and SVG where practical.
- Copy share URL.
- QR always resolves to the canonical form URL; do not encode unstable preview URLs.
- Optional dark/light foreground/background choices while preserving scan reliability.
- Track QR-origin traffic by generating a URL with a campaign query value such as `?src=qr`, not by creating a different form identity.
- QR generation itself is available on the free plan.

## 8. Basic analytics

V1 analytics:
- total views
- started submissions
- completed submissions
- completion rate
- average completion duration when measurable
- submissions over time
- per-question answer distribution for choice/rating fields

Do not build advanced BI in V1.

## 9. Pricing and entitlements

Launch recommendation:

### Free — ₹0
- 2 active published forms
- 250 completed submissions/month
- 25 MB total file storage
- platform branding remains
- QR codes included
- CSV export included
- basic conditional logic included
- 1 outgoing webhook per form

### Starter — ₹199/month or ₹1,990/year
- 15 active forms
- 5,000 completed submissions/month
- 1 GB file storage
- remove platform branding
- email notifications
- multiple webhooks
- custom themes/logo
- advanced conditional logic
- priority export/history convenience features

### Pro — ₹499/month or ₹4,990/year
- up to 100 active forms under fair use
- 25,000 completed submissions/month
- 10 GB file storage
- everything in Starter
- custom domain support when implemented
- advanced analytics
- higher webhook and notification limits
- form version history retention
- early access to future AI tools

### Business — future, not required for V1 launch
Target ~₹999–₹1,499/month depending on actual support/storage/team features.

Pricing must be data-driven and configurable from server-side plan definitions; do not scatter plan limits across frontend code.

## 10. Branding strategy

Do not hard-code the final product name in business logic. Use a centralized configuration module/environment values for:
- product name
- marketing domain
- support email
- logo assets
- legal company name

This allows branding to change without rewrites.

## 11. Non-goals for V1

Do not build:
- AI form generation
- real-time multi-user editing
- native iOS/Android apps
- enterprise SSO/SAML
- complex CRM integrations
- arbitrary user-supplied JavaScript
- marketplace/plugins
- payment collection inside respondent forms
- quiz grading engine
- HIPAA claims
- white-label reseller system

## 12. Success criteria

V1 is successful when a new user can go from signup to a shared working form in under five minutes, and a respondent can complete a five-question form comfortably on a mid-range mobile device.
