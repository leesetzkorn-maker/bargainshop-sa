import "server-only";

import { courierProviderKey } from "@/lib/env";
import { manualCourierProvider } from "./providers/manual";
import type { CourierProvider } from "./types";

/**
 * Courier module registry. Same extension point as payments: implement
 * CourierProvider, register it here, set COURIER_PROVIDER.
 */
const providers: Record<string, CourierProvider> = {
  manual: manualCourierProvider,
};

export function getCourierProvider(): CourierProvider {
  const key = courierProviderKey();
  return providers[key] ?? manualCourierProvider;
}

export function listCourierProviders(): CourierProvider[] {
  return Object.values(providers);
}
