import "server-only";
import type { PaymentProvider } from "../types";

/** Reserved provider slot. Never claims to accept payments before merchant approval and integration verification. */
export function peachConfigurationStatus() {
  const required = ["PEACH_MERCHANT_ID", "PEACH_CLIENT_ID", "PEACH_CLIENT_SECRET", "PEACH_WEBHOOK_SECRET"];
  return { provider: "peach", mode: process.env.PEACH_MODE === "live" ? "live" : "sandbox", credentialsPresent: required.every((key) => Boolean(process.env[key]?.trim())), missingKeys: required.filter((key) => !process.env[key]?.trim()), integrationVerified: false as const };
}

export const peachProvider: PaymentProvider = {
  key: "peach", label: "Peach Payments (awaiting integration verification)",
  isConfigured: false, canAcceptLivePayments: false,
  async createPaymentSession() { throw new Error("Peach Payments is not enabled. Merchant approval, the approved Checkout API credential mapping and sandbox verification are required."); },
  async getPaymentStatus() { throw new Error("Peach payment status verification is not connected yet."); },
};
