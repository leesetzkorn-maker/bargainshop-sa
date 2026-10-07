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
    // Keep the log readable: subject, recipient and the body only.
    const preview = [
      "",
      "─".repeat(72),
      `MAIL NOT SENT — no email provider configured (MAIL_PROVIDER=log)`,
      `To:      ${message.to}`,
      `Subject: ${message.subject}`,
      "─".repeat(72),
      message.text,
      "─".repeat(72),
      "",
    ].join("\n");

    console.info(preview);
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
