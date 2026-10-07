# Peach Payments preparation

The checkout and order code already use `PaymentProvider`; the `peach` provider is registered and deliberately disabled. Missing credentials never become an offline or successful Peach payment. The customer total passed to a gateway includes shipping. Card details must be collected by Peach, not this store.

After Peach approves the account:

1. Confirm the approved Checkout API version and authentication credentials with Peach. V1 Hosted uses an entity ID and a secret signing token; newer Checkout products have different credential requirements. Do not assume these are interchangeable.
2. Map approved credentials to server-only environment settings. Configuration placeholders exist for merchant ID, client ID/secret and webhook secret. Add version-specific settings only after the approved API is confirmed. Never prefix payment secrets with `NEXT_PUBLIC_`.
3. Complete `src/lib/payments/providers/peach.ts` behind the existing provider contract: create checkout using the persisted order amount/currency/reference; redirect to Peach's validated HTTPS checkout host; reconcile payment status from an authenticated server notification or status lookup.
4. Add the approved notification verifier to `/api/payments/peach/notify`; it currently refuses all notifications without settling an order. Browser returns alone must never settle money. Validate amount, currency, merchant, order reference, provider and status; process duplicate events idempotently using the existing settlement function.
5. Verify sandbox payment, failed/cancelled payment, duplicated/forged notification, incorrect amount/currency and closed-order behavior. Refund and reconciliation procedures also need account-specific verification.
6. Only then enable the provider and validate a live transaction on the final HTTPS deployment. This work does not require rebuilding the store's cart, order model or checkout UI.

Official sources checked 7 October 2026:

- [Peach Checkout documentation](https://developer.peachpayments.com/docs/checkout-hosted)
- [Hosted authentication](https://developer.peachpayments.com/docs/checkout-authentication)
- [Checkout notifications](https://developer.peachpayments.com/docs/checkout-webhooks)

No account approval, credentials, live rate, payment success or refund has been fabricated. No payment network request was made during preparation.
