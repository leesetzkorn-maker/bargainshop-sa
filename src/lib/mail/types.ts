import type { EmailStatus, EmailTemplate } from "@/lib/enums";

/**
 * Email provider contract.
 *
 * This is the only interface the rest of the app knows about. Nothing outside
 * `src/lib/mail/providers/` references a mail API.
 *
 * The important rule encoded in the return type: a provider may only report
 * SENT when it genuinely handed the message to a mail service. A module with no
 * credentials must report SKIPPED_NOT_CONFIGURED, never SENT. Every result —
 * including the skips — is written to the EmailLog table so the admin can see
 * the truth.
 *
 * To add a real provider:
 *   1. create src/lib/mail/providers/<service>.ts implementing MailProvider
 *   2. register it in src/lib/mail/registry.ts
 *   3. set MAIL_PROVIDER=<service> plus its credentials in the environment
 * No change to checkout, orders or the admin UI is required.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** HTML body. Must be email-client safe: tables, inline styles, no web fonts. */
  html: string;
  /** Plain-text alternative. Never optional — some clients show it only. */
  text: string;
  replyTo?: string;
  /**
   * Stable key so a retried send cannot double-charge a provider. Providers that
   * support idempotency should pass it through.
   */
  idempotencyKey?: string;
}

export interface MailSendResult {
  status: EmailStatus;
  /** The provider's own message id, when there is one. */
  providerRef?: string;
  error?: string;
}

export interface MailProvider {
  /** Stable module key, matches the filename. */
  readonly key: string;
  /** Shown in the admin UI so you know which module is live. */
  readonly label: string;
  /** True only when real credentials exist and delivery can actually happen. */
  readonly isConfigured: boolean;
  send(message: MailMessage): Promise<MailSendResult>;
}

/** Arguments for the high-level notification helpers. */
export interface OrderMailContext {
  orderNumber: string;
  /** Customer-facing order page, including the signed access token. */
  orderUrl: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: Array<{
    itemId: string;
    name: string;
    condition: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  delivery: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    method: string;
    notes: string | null;
  };
  paymentMethodLabel: string;
  /**
   * True when money was actually recorded against this order before it was
   * closed. The refund email must not tell an unpaid customer that "your payment
   * is being refunded" — that promise has to match whether there was a payment.
   */
  wasPaid: boolean;
  /** Only set on the shipped template. */
  tracking?: {
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  } | null;
  /** Only set on the cancelled / refunded templates. */
  reason?: string | null;
}

export type { EmailStatus, EmailTemplate };
