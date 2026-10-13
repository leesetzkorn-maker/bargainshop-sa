"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getAdminSession, isPrivileged } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { brand } from "@/lib/brand";
import { getPaymentProvider, isCheckoutOpen } from "@/lib/payments/registry";
import { yocoCredentials } from "@/lib/payments/providers/yoco";
import { isTrustedYocoCheckoutUrl } from "@/lib/payments/yoco-redirect";
import { R20_PAYMENT_TEST_CENTS, R20_PAYMENT_TEST_META_PREFIX, R20_PAYMENT_TEST_PREFIX } from "@/lib/payments/r20-smoke";

export type R20TestState = { error: string };

/** Explicit admin click; never starts money collection on page view. */
export async function startR20PaymentTest(_previous: R20TestState, _formData: FormData): Promise<R20TestState> {
  const admin = await getAdminSession();
  if (!admin || !(await isPrivileged(admin))) return { error: "Admin access is required." };

  const provider = getPaymentProvider();
  const credentials = yocoCredentials();
  if (!isCheckoutOpen() || provider.key !== "yoco" || !credentials) {
    return { error: "Yoco checkout is not currently active. No payment was started." };
  }

  // A real gateway redirect needs an HTTPS return on the deployed domain.
  if (process.env.NODE_ENV === "production" && !brand.url.startsWith("https://")) {
    return { error: "The HTTPS return URL has not been configured. No payment was started." };
  }

  const testId = randomUUID();
  const orderNumber = R20_PAYMENT_TEST_PREFIX + testId;
  const back = new URL("/admin/payment-test", brand.url);
  back.searchParams.set("id", testId);

  const log = await prisma.auditLog.create({
    data: {
      actorId: admin.userId,
      action: "payment_test.started",
      entity: "payment_test",
      entityId: testId,
      meta: { amountCents: R20_PAYMENT_TEST_CENTS, currency: "ZAR", status: "STARTED", mode: credentials.mode },
    },
  });

  let redirectUrl: string;
  let providerRef: string | null = null;
  try {
    const result = await provider.createPaymentSession({
      orderId: R20_PAYMENT_TEST_META_PREFIX + testId,
      orderNumber,
      amountCents: R20_PAYMENT_TEST_CENTS,
      currency: "ZAR",
      customer: { fullName: admin.name, email: admin.email, phone: "" },
      delivery: { method: "PAYMENT_TEST", province: "GP", city: "Pretoria", postalCode: "0001", line1: "Not a physical order" },
      lines: [{ name: "Private R20 payment gateway check (no goods)", amountCents: R20_PAYMENT_TEST_CENTS, quantity: 1 }],
      successUrl: back.toString() + "&returned=1",
      cancelUrl: back.toString() + "&cancelled=1",
      notifyUrl: new URL("/api/payments/yoco/notify", brand.url).toString(),
    });
    if (!result.redirectUrl) throw new Error("Yoco did not return a checkout URL.");
    const target = new URL(result.redirectUrl);
    if (target.protocol !== "https:" || !["pay.yoco.com", "checkout.yoco.com"].includes(target.hostname)) {
      throw new Error("The checkout URL was not hosted by Yoco.");
    }
    redirectUrl = result.redirectUrl;
    providerRef = result.providerRef;
    await prisma.auditLog.updateMany({
      where: { id: log.id, action: "payment_test.started" },
      data: { action: "payment_test.awaiting", meta: { amountCents: R20_PAYMENT_TEST_CENTS, currency: "ZAR", status: "AWAITING", mode: credentials.mode, checkoutId: providerRef } },
    });
  } catch (error) {
    await prisma.auditLog.updateMany({
      where: { id: log.id, action: "payment_test.started" },
      data: { action: "payment_test.failed", meta: { amountCents: R20_PAYMENT_TEST_CENTS, currency: "ZAR", status: "CHECKOUT_ERROR" } },
    });
    return { error: error instanceof Error ? `The gateway could not open: ${error.message}` : "Yoco checkout could not be started." };
  }
  redirect(redirectUrl);
}
