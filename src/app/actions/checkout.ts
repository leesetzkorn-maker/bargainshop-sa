"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { readCart, clearCart } from "@/lib/cart";
import { checkoutSchema, flattenErrors, type CheckoutInput } from "@/lib/validation";
import { createOrderFromCheckout } from "@/lib/dal/orders";
import { getPaymentProvider, isCheckoutOpen } from "@/lib/payments/registry";
import { grantOrderAccess } from "@/lib/order-access";
import { notifyOrderReceived } from "@/lib/mail/order-notifications";
import { prisma } from "@/lib/db";

export interface CheckoutState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  unavailable?: Array<{ name: string; reason: string }>;
  resolvedMethod?: string;
  /**
   * Set when the gateway needs a signed POST rather than a plain redirect
   * (PayFast and friends). The form renders this and submits itself.
   */
  gatewayForm?: { action: string; fields: Record<string, string> };
}

export async function submitCheckoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  if (!isCheckoutOpen()) {
    return {
      ok: false,
      error:
        "Checkout is temporarily unavailable. Please contact us and we will take your order directly.",
    };
  }

  if (String(formData.get("website") ?? "").length > 0) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const parsed = checkoutSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    line1: formData.get("line1"),
    line2: formData.get("line2") ?? "",
    suburb: formData.get("suburb"),
    city: formData.get("city"),
    province: formData.get("province"),
    postalCode: formData.get("postalCode"),
    deliveryMethod: formData.get("deliveryMethod"),
    pickupPoint: formData.get("pickupPoint") ?? "",
    quotedShippingCents: formData.get("quotedShippingCents") ?? undefined,
    quotedSubtotalCents: formData.get("quotedSubtotalCents") ?? undefined,
    orderNotes: formData.get("orderNotes") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields and try again.",
      fieldErrors: flattenErrors(parsed.error),
    };
  }

  const input: CheckoutInput = parsed.data;

  const cart = await readCart();
  if (cart.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  const result = await createOrderFromCheckout(cart, input);

  if (!result.ok || !result.orderNumber || !result.orderId) {
    return {
      ok: false,
      error: result.error ?? "We could not complete your order.",
      unavailable: result.unavailable,
    };
  }

  await clearCart();
  await grantOrderAccess(result.orderNumber);

  // The order is already committed and stock is already reserved at this point.
  // A failed audit write must not throw, or the customer would see an error page
  // and be tempted to submit a second order for stock we no longer have.
  try {
    await prisma.auditLog.create({
      data: {
        action: "order.created",
        entity: "order",
        entityId: result.orderNumber,
        meta: {
          provider: getPaymentProvider().key,
          itemCount: cart.reduce((sum, line) => sum + line.quantity, 0),
          subtotalCents: result.subtotalCents ?? null,
          totalCents: result.totalCents ?? null,
          redirected: Boolean(result.redirectUrl),
        },
      },
    });
  } catch (error) {
    console.error("checkout: audit log write failed", { orderNumber: result.orderNumber, error });
  }

  // Tell both sides the order exists. Same rule as the audit write: the order is
  // already committed, so a mail failure is logged and swallowed rather than
  // shown to a customer whose stock is already reserved.
  try {
    await notifyOrderReceived(result.orderId);
  } catch (error) {
    console.error("checkout: order-received notification failed", {
      orderNumber: result.orderNumber,
      error,
    });
  }

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/cart");

  // A POST gateway cannot be reached with redirect(): the browser has to submit a
  // signed form, so hand the fields back and let the client do it. The order is
  // already committed in either case.
  if (result.redirectUrl && result.redirectMethod === "POST") {
    return {
      ok: true,
      resolvedMethod: result.redirectUrl,
      gatewayForm: {
        action: result.redirectUrl,
        fields: result.redirectFields ?? {},
      },
    };
  }

  if (result.redirectUrl) {
    redirect(result.redirectUrl);
  }

  redirect(`/order/${result.orderNumber}?placed=1`);
}
