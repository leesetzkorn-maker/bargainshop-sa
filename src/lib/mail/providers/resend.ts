import { mailFrom, resendApiKey } from "@/lib/env";
import type { MailMessage, MailProvider, MailSendResult } from "../types";

/**
 * Real email delivery over the Resend HTTP API.
 *
 * Resend is used because it needs no native dependency — plain `fetch` against
 * a JSON endpoint — which keeps the production bundle small and the install
 * free of build tools. The module stays completely unconfigured until
 * RESEND_API_KEY is present, so nothing here can accidentally fire in dev.
 *
 * Swapping in a different provider (Postmark, Brevo, an SMTP relay) means
 * writing one more file in this folder and registering it; nothing else in the
 * codebase references Resend.
 */
export const resendProvider: MailProvider = {
  key: "resend",
  label: "Resend",
  isConfigured: Boolean(resendApiKey()),

  async send(message: MailMessage): Promise<MailSendResult> {
    const apiKey = resendApiKey();
    if (!apiKey) {
      return {
        status: "SKIPPED_NOT_CONFIGURED",
        error: "RESEND_API_KEY is not set.",
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: mailFrom(),
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; name?: string }
        | null;

      if (!response.ok) {
        return {
          status: "FAILED",
          error: payload?.message ?? payload?.name ?? `Resend returned ${response.status}.`,
        };
      }

      return { status: "SENT", providerRef: payload?.id };
    } catch (error) {
      // Network failure, DNS, timeout. Never throw: a mail outage must not
      // roll back an order that is already committed.
      return {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error talking to Resend.",
      };
    }
  },
};
