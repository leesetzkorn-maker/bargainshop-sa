import type { MailMessage, MailProvider, MailSendResult } from "../types";

/**
 * The default module, and the honest one.
 *
 * There is no mail provider wired up, so this prints the message to the server
 * log where you can read it while developing — and then reports
 * SKIPPED_NOT_CONFIGURED, never SENT. That distinction matters: the admin
 * dashboard says "Not sent — no provider configured" rather than showing a
 * green tick on an email that never left the machine.
 */
export const logProvider: MailProvider = {
  key: "log",
  label: "Not configured (printed to the server log)",
  isConfigured: false,

  async send(message: MailMessage): Promise<MailSendResult> {
    // Production logs may be accessible to support staff and log processors.
    // Never print email bodies, names, addresses or signed order-access URLs.
    // The database EmailLog records the actual non-delivery outcome.
    console.warn("MAIL NOT SENT: no outbound mail provider configured. Check the private admin EmailLog.");

    return {
      status: "SKIPPED_NOT_CONFIGURED",
      error: "No email provider is configured. Set MAIL_PROVIDER and its credentials.",
    };
  },
};

/**
 * Turns email off completely — no delivery attempt and no log spam. Useful for
 * staging environments that should not produce output at all.
 */
export const disabledProvider: MailProvider = {
  key: "disabled",
  label: "Disabled (no email is sent or logged)",
  isConfigured: false,

  async send(): Promise<MailSendResult> {
    return {
      status: "SKIPPED_NOT_CONFIGURED",
      error: "Email is disabled on this deployment (MAIL_PROVIDER=disabled).",
    };
  },
};
