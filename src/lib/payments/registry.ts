import "server-only";

import { paymentProviderKey } from "@/lib/env";
import { offlineProvider } from "./providers/offline";
import { payfastProvider } from "./providers/payfast";
import { peachProvider } from "./providers/peach";
import type { PaymentProvider } from "./types";

/**
 * Payment module registry.
 *
 * Adding a real South African gateway means: write a provider that satisfies
 * `PaymentProvider`, add it to `providers`, and set PAYMENT_PROVIDER in the
 * environment. Nothing else in the codebase changes.
 */
const providers: Record<string, PaymentProvider> = {
  offline: offlineProvider,
  payfast: payfastProvider,
  peach: peachProvider,
};

/** Explicit opt-out. `PAYMENT_PROVIDER=none` closes checkout entirely. */
const disabledProvider: PaymentProvider = {
  key: "none",
  label: "Checkout disabled",
  isConfigured: false,
  canAcceptLivePayments: false,
  async createPaymentSession() {
    throw new Error("Checkout is disabled.");
  },
  async getPaymentStatus() {
    return { status: "PENDING", providerRef: null };
  },
};

export function listPaymentProviders(): PaymentProvider[] {
  return [...Object.values(providers), disabledProvider];
}

/**
 * Resolve the active provider.
 *
 *   - an unknown or "none" key closes checkout
 *   - a known gateway with complete credentials is used
 *   - a known gateway with *incomplete* credentials falls back to `offline`,
 *     so a half-filled environment degrades to the honest manual flow instead
 *     of sending customers to a gateway that will reject them
 */
export function getPaymentProvider(): PaymentProvider {
  const key = paymentProviderKey();
  if (key === "none") return disabledProvider;

  const requested = providers[key];
  if (key === "peach") return peachProvider;
  if (!requested) return disabledProvider;
  if (requested.isConfigured) return requested;

  return process.env.NODE_ENV === "production" ? disabledProvider : offlineProvider;
}

/** False when no module can take a live payment — used to close checkout. */
export function isCheckoutOpen(): boolean {
  const provider = getPaymentProvider();
  return provider.isConfigured && (process.env.NODE_ENV !== "production" || provider.canAcceptLivePayments);
}
