import "server-only";

import { mailProviderKey } from "@/lib/env";
import { disabledProvider, logProvider } from "./providers/log";
import { resendProvider } from "./providers/resend";
import type { MailProvider } from "./types";

/**
 * Email module registry.
 *
 * Adding a real provider means: write a file in `providers/` that satisfies
 * `MailProvider`, add it to `providers`, and set MAIL_PROVIDER. Checkout,
 * orders and the admin UI do not change.
 */
const providers: Record<string, MailProvider> = {
  log: logProvider,
  disabled: disabledProvider,
  resend: resendProvider,
};

export function listMailProviders(): MailProvider[] {
  return Object.values(providers);
}

export function getMailProvider(): MailProvider {
  const key = mailProviderKey();
  return providers[key] ?? logProvider;
}

/** True when a message would genuinely be delivered. Drives the admin banner. */
export function isEmailConfigured(): boolean {
  return getMailProvider().isConfigured;
}
