import "server-only";

import { gatewayCredential } from "@/lib/env";
import { yocoCredentialsFrom, type YocoCredentials } from "./yoco-core";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentSessionStatus,
} from "../types";

/**
 * Yoco — South African gateway, hosted Checkout API page.
 *
 * The customer is redirected to a Yoco-hosted checkout, pays there, and Yoco
 * POSTs a signed webhook back to /api/payments/yoco/notify. That webhook, not
 * the browser's return, is the only thing that marks an order paid: the redirect
 * target is a public URL and proves nothing.
 *
 * The Checkout API has no "read this checkout" endpoint — only create and
 * refund — so `getPaymentStatus` cannot poll. It reports the last known state
 * and the webhook remains the single source of truth, exactly like the PayFast
 * module in this repository.
 *
 * NOT YET VERIFIED END TO END. Written against Yoco's published documentation
 * and unit tested; no test-mode round trip has been run because no Yoco account
 * is connected yet. Before taking real money: register the webhook, complete one
 * test checkout, and confirm the order flips to PAID.
 *
 * Activation is a key swap, not a code change. With `sk_test_…` the module runs
 * in test mode; replacing YOCO_SECRET_KEY with the `sk_live_…` key is what
 * starts charging real cards, so do that only after the test checkout works.
 */

const CHECKOUTS_URL = "https://payments.yoco.com/api/checkouts";

export function yocoCredentials(): YocoCredentials | null {
  return yocoCredentialsFrom(
    gatewayCredential("YOCO_SECRET_KEY"),
    gatewayCredential("YOCO_WEBHOOK_SECRET"),
  );
}

export const yocoProvider: PaymentProvider = {
  key: "yoco",
  label: "Yoco (card, Instant EFT)",
  get isConfigured() {
    return yocoCredentials() !== null;
  },
  /**
   * Same reading as every other module in this file: "credentials present" means
   * checkout is open. During the test phase that means a test key is live in
   * production, which is deliberate — the test checkout has to happen on the
   * deployed store — and it charges nothing. Swap the key to go live.
   */
  get canAcceptLivePayments() {
    return yocoCredentials() !== null;
  },

  async createPaymentSession(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const creds = yocoCredentials();
    if (!creds) {
      throw new Error("Yoco is selected but YOCO_SECRET_KEY and YOCO_WEBHOOK_SECRET are not both set.");
    }
    // Yoco settles ZAR only. Failing here leaves the order PENDING_PAYMENT for
    // an admin to resolve, which is honest; charging R1.00 as ZAR would not be.
    if (input.currency.toUpperCase() !== "ZAR") {
      throw new Error(`Yoco only settles ZAR, but this order is in ${input.currency}.`);
    }

    const body = {
      amount: input.amountCents,
      currency: "ZAR",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      // The order page already says "we have not been told the money cleared
      // yet" until a webhook arrives, so a failed attempt lands somewhere useful
      // instead of in an emptied cart.
      failureUrl: input.successUrl,
      // Carried back on the webhook so the order can be found without trusting
      // anything the browser sends.
      metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
      externalId: input.orderNumber,
      clientReferenceId: input.orderId,
    };

    const response = await fetch(CHECKOUTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.secretKey}`,
        "Content-Type": "application/json",
        // Yoco refuses a second checkout created under a key that is still
        // processing; the order number makes a retry after a network blip safe.
        "Idempotency-Key": `order-${input.orderNumber}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Yoco rejected the checkout (HTTP ${response.status}): ${detail}`);
    }

    const checkout = (await response.json()) as {
      id?: string;
      redirectUrl?: string;
      processingMode?: string;
      merchantId?: string;
      amount?: number;
      currency?: string;
    };

    if (!checkout.id || !checkout.redirectUrl) {
      throw new Error("Yoco returned a checkout without an id or a redirect URL.");
    }

    return {
      redirectUrl: checkout.redirectUrl,
      providerRef: checkout.id,
      raw: {
        module: "yoco",
        checkoutId: checkout.id,
        processingMode: checkout.processingMode,
        merchantId: checkout.merchantId,
        amount: checkout.amount,
        currency: checkout.currency,
      },
    };
  },

  /**
   * There is no read endpoint on the Checkout API, so there is nothing honest to
   * poll. The webhook settles the order; this reports the stored reference so
   * callers see the state they already have rather than an invented one.
   */
  async getPaymentStatus(providerRef: string): Promise<PaymentSessionStatus> {
    return { status: "PENDING", providerRef: providerRef || null };
  },
};
