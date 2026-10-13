import Link from "next/link";
import type { Metadata } from "next";
import { getAdminSession } from "@/lib/auth/session";
import { getPaymentProvider, isCheckoutOpen } from "@/lib/payments/registry";
import { CHECKOUT_TEST_SLUG } from "@/lib/checkout-test";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "R20 real checkout test", robots: { index: false, follow: false } };

export default async function PaymentTestPage() {
  const admin = await getAdminSession();
  if (!admin || admin.role !== "OWNER") {
    return <p>Only the store owner can start this real-money test.</p>;
  }
  const gateway = getPaymentProvider();
  const enabled = isCheckoutOpen();
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="heading-section text-2xl text-ink-900">R20 — test the REAL store checkout</h1>
      <div className="card space-y-4 p-5">
        <p className="text-sm text-ink-700">
          No separate payment button. Use the ordinary product page, Buy Now,
          address form, checkout, Yoco card payment, order confirmation and Admin → Orders,
          exactly like a real customer.
        </p>
        <p className="font-bold text-ink-900">Total for the test: R20.00 — no parcel or shipping.</p>
        <p className="text-sm text-amber-800">
          Yoco is configured as {gateway.label}. If LIVE, completing this purchase
          charges your card R20 for real; fees may apply. No automatic refund is issued.
        </p>
        {!enabled ? (
          <p className="text-sm text-danger-700">Checkout is not available. Do not try a payment until the gateway is active.</p>
        ) : (
          <Link href={`/product/${CHECKOUT_TEST_SLUG}`} className="btn btn-primary btn-lg">
            Open R20 test product → Buy Now
          </Link>
        )}
        <p className="text-xs text-ink-600">This test product is not listed in the public shop and can only be purchased by the signed-in store owner. No physical item will be supplied.</p>
      </div>
      <p className="text-sm text-ink-600">
        After paying, return to the order confirmation and check Admin → Orders.
        It must show PAID after the verified Yoco webhook arrives.
        A redirect from Yoco alone is not proof of payment.
      </p>
    </div>
  );
}
