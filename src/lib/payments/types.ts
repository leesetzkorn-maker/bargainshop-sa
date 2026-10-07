/**
 * Payment provider contract.
 *
 * This is the ONLY interface the rest of the app knows about. Checkout calls
 * `createPaymentSession()` and nothing else; it never imports PayFast /
 * iKhokha / GoTyme (or any other gateway) directly.
 *
 * To add a real South African gateway later:
 *   1. create src/lib/payments/providers/<gateway>.ts implementing PaymentProvider
 *   2. register it in src/lib/payments/registry.ts
 *   3. add its credentials to the server env (see .env.example)
 *   4. set PAYMENT_PROVIDER=<gateway>
 * No change to checkout, orders, or the admin UI is required.
 */

import type { Order, OrderItem, Customer, Address } from "@prisma/client";

export interface PaymentLine {
  name: string;
  /** Cents. */
  amountCents: number;
  quantity: number;
  /** Optional deep link back to the store. */
  url?: string;
}

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  /** Cents. */
  amountCents: number;
  currency: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  delivery: {
    method: string;
    province: string;
    city: string;
    postalCode: string;
    line1: string;
  };
  lines: PaymentLine[];
  /** Absolute URL the gateway should return the customer to. */
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

export interface CreatePaymentResult {
  /** Where to send the customer next. Null means "no redirect needed". */
  redirectUrl: string | null;
  /**
   * How to send them. A plain GET redirect is the default. Gateways that collect
   * card details themselves (PayFast, PayGate, iKhokha) require a POST of signed
   * fields instead, so the checkout page renders a form and submits it rather
   * than following a link.
   */
  redirectMethod?: "GET" | "POST";
  /** Only for redirectMethod "POST": the fields to post, signature included. */
  redirectFields?: Record<string, string>;
  /** The gateway's own checkout/session id, stored on the Payment row. */
  providerRef: string | null;
  /** Instructions to show the customer when there is no redirect (e.g. EFT). */
  instructions?: string[];
  /** Raw gateway payload for the admin audit trail. Never customer-visible. */
  raw?: unknown;
}

export interface PaymentSessionStatus {
  /** Map onto PaymentRecordStatus in src/lib/enums.ts. */
  status: "PENDING" | "AUTHORISED" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  providerRef: string | null;
  raw?: unknown;
}

export interface PaymentProvider {
  /** Stable module key, matches the filename. */
  readonly key: string;
  /** Shown in the admin UI so you know which module is live. */
  readonly label: string;

  /** False until real credentials exist. The storefront hides checkout if false. */
  readonly isConfigured: boolean;

  /** True when the module can accept a live payment right now. */
  readonly canAcceptLivePayments: boolean;

  /**
   * Static instructions shown on the confirmation page when the order is not
   * yet settled. Providers that redirect the customer away do not need these.
   */
  readonly customerInstructions?: string[];

  /**
   * Create a checkout session for an order.
   * Must be side-effect-free with respect to stock — stock is reserved before
   * this is called.
   */
  createPaymentSession(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /** Poll the gateway for the authoritative payment state. */
  getPaymentStatus(providerRef: string): Promise<PaymentSessionStatus>;

  /** Optional: request a refund. Offline providers return a "manual" result. */
  refund?(providerRef: string, amountCents: number): Promise<{ ok: boolean; reference?: string }>;
}

/** Shape helpers so providers do not have to import Prisma types. */
export type OrderForPayment = Pick<
  Order,
  "id" | "orderNumber" | "totalCents" | "currency" | "deliveryMethod" | "deliveryProvince"
>;
export type OrderItemForPayment = Pick<
  OrderItem,
  "nameSnapshot" | "unitPriceCents" | "quantity" | "lineTotalCents"
>;
export type CustomerForPayment = Pick<Customer, "fullName" | "email" | "phone">;
export type AddressForPayment = Pick<
  Address,
  "line1" | "line2" | "suburb" | "city" | "province" | "postalCode" | "country"
>;
