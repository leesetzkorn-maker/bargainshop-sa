import type { Metadata } from "next";
import { getAdminSession, isPrivileged } from "@/lib/auth/session";
import { getPaymentProvider, isCheckoutOpen } from "@/lib/payments/registry";
import { yocoCredentials } from "@/lib/payments/providers/yoco";
import { prisma } from "@/lib/db";
import { R20PaymentButton } from "@/components/admin/r20-payment-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "R20 payment test", robots: { index: false, follow: false } };

export default async function PaymentTestPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[]; returned?: string; cancelled?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin || !(await isPrivileged(admin))) {
    return <p>Admin permissions are required for payment testing.</p>;
  }
  const provider = getPaymentProvider();
  const creds = yocoCredentials();
  const enabled = provider.key === "yoco" && Boolean(creds) && isCheckoutOpen();
  const params = await searchParams;
  const testId = typeof params.id === "string" ? params.id : "";
  const record = testId ? await prisma.auditLog.findFirst({
    where: { entity: "payment_test", entityId: testId, actorId: admin.userId },
    select: { action: true, createdAt: true, meta: true },
  }) : null;
  const paid = record?.action === "payment_test.paid";
  const failed = record?.action === "payment_test.failed";
  const returned = params.returned === "1";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="heading-section text-2xl text-ink-900">Private R20 payment test</h1>
        <p className="mt-2 text-sm text-ink-600">Admin-only. Tests a real Yoco checkout and a signed payment confirmation webhook. No product, delivery or stock is involved. This test is excluded from store orders, sales and profit figures.</p>
      </div>
      <div className="card space-y-4 p-5">
        <p className="font-semibold">Amount: R20.00</p>
        <p className="text-sm text-ink-600">Payment provider: {enabled ? "Yoco" : "Not active"}.</p>
        {enabled && creds?.mode === "live" ? (
          <p className="text-sm text-amber-800">LIVE MODE: Completing this test with your bank card will charge R20. Yoco transaction fees may apply. No automatic refund is made.</p>
        ) : enabled ? (
          <p className="text-sm text-ink-600">TEST MODE: Use Yoco's official test-card details; no real money will be debited.</p>
        ) : (
          <p role="alert" className="text-sm text-danger-700">Yoco is not active yet. You cannot pay until the gateway configuration is verified.</p>
        )}
        {enabled ? <R20PaymentButton /> : null}
      </div>
      {record ? (
        <div className="card space-y-2 p-5">
          <h2 className="text-lg font-bold">Latest test status</h2>
          <p className={paid ? "font-semibold text-green-700" : "font-semibold text-ink-800"}>
            {paid ? "PAID — signed Yoco webhook verified" : failed ? "Payment failed or checkout unavailable" : returned ? "Returned from Yoco — awaiting signed webhook" : "Awaiting Yoco confirmation"}
          </p>
          <p className="text-sm text-ink-600">Test reference: {testId}</p>
          <p className="text-xs text-ink-500">
            Returning from Yoco does not itself confirm payment. If still pending, refresh this page after a minute and check the Yoco dashboard.
          </p>
        </div>
      ) : null}
    </div>
  );
}
