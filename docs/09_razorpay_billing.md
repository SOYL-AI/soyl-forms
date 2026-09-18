# Razorpay Billing Specification

## 1. Billing model

Use Razorpay Subscriptions for Starter and Pro recurring plans.

Support:
- monthly
- yearly

Free plan has no provider subscription.

## 2. Prices

Recommended initial prices:
- Starter Monthly: ₹199
- Starter Yearly: ₹1,990
- Pro Monthly: ₹499
- Pro Yearly: ₹4,990

Store monetary amounts in paise.

Example:
- ₹199 = `19900`
- ₹499 = `49900`

## 3. Razorpay plan mapping

Create provider plans in Razorpay and store IDs in server environment/config:
- `RAZORPAY_PLAN_STARTER_MONTHLY`
- `RAZORPAY_PLAN_STARTER_YEARLY`
- `RAZORPAY_PLAN_PRO_MONTHLY`
- `RAZORPAY_PLAN_PRO_YEARLY`

Do not create a new Razorpay Plan for every customer.

## 4. Upgrade flow

Server:
1. authenticate workspace owner
2. validate requested internal plan/interval
3. resolve trusted Razorpay plan ID server-side
4. create Razorpay subscription
5. store local subscription in `created` state
6. return safe checkout data

Client:
7. open Razorpay Checkout
8. user authorizes payment/mandate
9. show pending/success UX based on verification

Server/webhook:
10. verify subscription lifecycle events
11. update local subscription status
12. entitlement engine maps active status to paid plan

## 5. Source of truth

Razorpay webhook state is the normal source of truth for recurring lifecycle.

Browser callbacks can improve immediate UX but must not permanently activate a plan without server/provider verification.

## 6. Webhook endpoint

`POST /api/webhooks/razorpay`

Critical requirements:
- read raw request body
- verify `X-Razorpay-Signature` with webhook secret
- use `x-razorpay-event-id` as idempotency identifier
- accept duplicate delivery safely
- do not assume events arrive in perfect order
- return 2xx quickly after durable processing/queueing

Store event record before applying side effects where practical.

## 7. Subscription events

Handle the subscription lifecycle events provided by current Razorpay documentation, including active, payment-failure/pending, halted, cancelled and completed/expired equivalents where applicable.

Implementation agent must verify the exact current event names/payload fields against Razorpay docs rather than guessing.

Known relevant event family includes events such as `subscription.activated`, `subscription.pending`, and `subscription.halted`.

## 8. Failed recurring payment

Recommended entitlement behavior:
- `pending`: retain access briefly if Razorpay is retrying; show billing warning
- `halted`: downgrade/disable premium publishing according to grace-period policy
- `cancelled`: paid access remains until local verified period end if cancellation is scheduled; otherwise follow provider state

Do not immediately delete customer forms on downgrade.

## 9. Downgrade behavior

If paid user returns to Free while having >2 published forms:
- keep data
- allow selecting up to 2 to remain active, or automatically preserve the two most recently active and close others after clear warning
- do not delete forms/responses
- premium-only configuration remains stored but inactive where needed

## 10. Billing portal

V1 billing page should show:
- current plan
- interval
- renewal/status
- usage
- upgrade buttons
- cancel action

If Razorpay lacks a suitable hosted self-service management portal for a required action, implement narrow server endpoints using the official API.

## 11. Payment fees

For unit economics, assume standard domestic Razorpay payment-gateway pricing around 2% platform fee plus GST on the fee where applicable, but treat this as a planning assumption and verify actual merchant account terms.

## 12. Security

Never expose:
- Razorpay Key Secret
- webhook secret
- internal plan mappings that enable price tampering

The browser may receive the publishable Key ID and a server-created subscription ID only as required by Razorpay Checkout.
