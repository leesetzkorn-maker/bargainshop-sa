import "server-only";

import { prisma } from "@/lib/db";
import { getMailProvider } from "./registry";
import type { EmailStatus, EmailTemplate } from "@/lib/enums";
import type { MailMessage } from "./types";

/**
 * The single exit point for every outbound message.
 *
 * Two rules this function exists to enforce:
 *
 *  1. It never throws. A mail outage, a bad address or a missing API key must
 *     not roll back an order that is already committed, so every failure is
 *     swallowed into the returned result.
 *  2. It never claims success it did not have. Whatever the provider reports is
 *     written to EmailLog verbatim, including SKIPPED_NOT_CONFIGURED. The admin
 *     UI reads that table, so a missing provider shows up as a visible gap
 *     rather than a silent no-op.
 */
export interface SendResult {
  ok: boolean;
  status: EmailStatus;
  provider: string;
  providerRef?: string;
  error?: string;
}

export async function sendMail(
  template: EmailTemplate,
  input: Omit<MailMessage, "idempotencyKey"> & { orderId?: string | null; idempotencyKey?: string },
): Promise<SendResult> {
  const provider = getMailProvider();
  const { orderId, idempotencyKey, ...message } = input;

  // No recipient: record it so the gap is visible instead of silent.
  if (!message.to || !message.to.includes("@")) {
    await record(template, {
      orderId: orderId ?? null,
      to: message.to ?? "",
      subject: message.subject,
      provider: provider.key,
      status: "SKIPPED_NO_RECIPIENT",
      error: "No valid recipient address.",
    });
    return { ok: false, status: "SKIPPED_NO_RECIPIENT", provider: provider.key, error: "No recipient." };
  }

  let result;
  try {
    result = await provider.send({ ...message, idempotencyKey });
  } catch (error) {
    result = {
      status: "FAILED" as const,
      error: error instanceof Error ? error.message : "Unknown error sending email.",
    };
  }

  await record(template, {
    orderId: orderId ?? null,
    to: message.to,
    subject: message.subject,
    provider: provider.key,
    status: result.status,
    error: result.error ?? null,
    providerRef: result.providerRef ?? null,
  });

  return {
    ok: result.status === "SENT",
    status: result.status,
    provider: provider.key,
    providerRef: result.providerRef,
    error: result.error,
  };
}

type RecordInput = {
  orderId: string | null;
  to: string;
  subject: string;
  provider: string;
  status: string;
  error?: string | null;
  providerRef?: string | null;
};

async function record(template: EmailTemplate, input: RecordInput): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        template,
        orderId: input.orderId,
        to: input.to,
        subject: input.subject,
        provider: input.provider,
        status: input.status,
        error: input.error ?? null,
        providerRef: input.providerRef ?? null,
      },
    });
  } catch (error) {
    // The audit trail must not be able to break the order flow.
    console.error("mail: could not write EmailLog", {
      template,
      to: input.to,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/** Resend-safe idempotency key: stable per order + template. */
export function mailIdempotencyKey(orderNumber: string, template: EmailTemplate, suffix = ""): string {
  return `2de/${orderNumber}/${template}${suffix ? `/${suffix}` : ""}`.toLowerCase().replace(/[^a-z0-9/_-]/g, "-");
}
