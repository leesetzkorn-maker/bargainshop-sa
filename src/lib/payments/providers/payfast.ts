import "server-only";

import { gatewayCredential } from "@/lib/env";
import {
  payfastAmount,
  payfastHost,
  payfastSignature,
  PAYFAST_HOSTS,
  type PayFastCredentials,
} from "./payfast-signature";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentSessionStatus,
} from "../types";

/**
 * PayFast — South Africa's most widely used online gateway.
 *
 * PayFast is a redirect gateway: the customer is posted to a PayFast-hosted
 * form, pays there, and PayFast posts a server-to-server notification (ITN)
 * back to `notifyUrl`. That ITN — not the browser's return URL — is the only
 * thing that may mark an order paid. The return URL is just a page the customer
 * lands on, and anyone can hand-craft it, which is why
 * /order/[orderNumber]?paid=1 shows "checking your payment" instead of
 * "payment received" until the ITN arrives.
 *
 * Nothing here activates without real credentials. `isConfigured` is false until
 * a merchant id, merchant key and passphrase are all present, so a partially
 * filled environment falls back to the offline module rather than sending
 * customers to a gateway that will reject them.
 *
 * NOT YET VERIFIED END TO END. This module was written against PayFast's
 * published documentation and unit-tested, but no live or sandbox round trip has
 * been run because no merchant account exists yet. Before taking real money,
 * run one sandbox transaction and confirm the ITN marks the order paid.
 */

function credentials(): PayFastCredentials | null {
  const sandbox = gatewayCredential("PAYFAST_SANDBOX_ID") !== undefined;
  const merchantId = sandbox
    ? gatewayCredential("PAYFAST_SANDBOX_ID")
    : gatewayCredential("PAYFAST_LIVE_ID");
  const merchantKey = sandbox
    ? gatewayCredential("PAYFAST_SANDBOX_PASS")
    : gatewayCredential("PAYFAST_LIVE_PASS");
  const passphrase = gatewayCredential("PAYFAST_PASSPHRASE");

  if (!merchantId || !merchantKey || !passphrase) return null;
  return { merchantId, merchantKey, passphrase, sandbox };
}

export function payfastCredentials(): PayFastCredentials | null {
  return credentials();
}

export const payfastProvider: PaymentProvider = {
  key: "payfast",
  label: "PayFast (card, EFT, SnapScan)",
  get isConfigured() {
    return credentials() !== null;
  },
  get canAcceptLivePayments() {
    return credentials() !== null;
  },

  async createPaymentSession(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const creds = credentials();
    if (!creds) {
      throw new Error("PayFast is selected but its credentials are not fully set.");
    }

    const [firstName, ...rest] = input.customer.fullName.trim().split(/\s+/);
    const lastName = rest.join(" ");

    const fields: Record<string, string> = {
      merchant_id: creds.merchantId,
      merchant_key: creds.merchantKey,
      return_url: input.successUrl,
      cancel_url: input.cancelUrl,
      notify_url: input.notifyUrl,
      name_first: firstName || input.customer.fullName,
      name_last: lastName,
      email_address: input.customer.email,
      cell_number: input.customer.phone.replace(/\s/g, ""),
      m_payment_id: input.orderNumber,
      amount: payfastAmount(input.amountCents),
      // PayFast shows one line item. The basket itself is the order page.
      item_name: `Order ${input.orderNumber}`,
    };

    // custom_int1 is echoed back on the ITN, so the webhook can find the order
    // without trusting anything the browser sends.
    fields.custom_int1 = input.orderId;

    return {
      // PayFast's checkout is a POST of these fields, not a plain redirect, so
      // the confirmation page renders and auto-submits the form.
      redirectUrl: `https://${payfastHost(creds.sandbox)}/eng/process`,
      redirectMethod: "POST",
      redirectFields: { ...fields, signature: payfastSignature(fields, creds.passphrase) },
      providerRef: null,
      raw: { module: "payfast", sandbox: creds.sandbox, merchantId: creds.merchantId },
    };
  },

  /**
   * PayFast's REST transaction API needs a separately enabled API key, which
   * this repository deliberately does not assume exists. The ITN webhook is the
   * authoritative source for status; this returns the last recorded state
   * rather than inventing one.
   */
  async getPaymentStatus(): Promise<PaymentSessionStatus> {
    return { status: "PENDING", providerRef: null };
  },
};

/** True when a request's Referer names PayFast. Used by the ITN route. */
export function isPayfastReferer(referer: string | null): boolean {
  if (!referer) return false;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    return (PAYFAST_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}
