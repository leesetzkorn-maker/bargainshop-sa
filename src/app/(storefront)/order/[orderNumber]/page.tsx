import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOrderForCustomer } from "@/lib/dal/orders";
import { canViewOrder } from "@/lib/order-access";
import { getPaymentProvider } from "@/lib/payments/registry";
import { Alert, Breadcrumbs } from "@/components/ui";
import { formatZAR } from "@/lib/money";
import { brand, hasWhatsapp, whatsappLink } from "@/lib/brand";
import { ContactLinks } from "@/components/contact-links";
import { CustomerStepper } from "@/components/customer-stepper";
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_CUSTOMER_MESSAGE,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  provinceName,
  PRODUCT_CONDITION_LABELS,
  SHIPPING_METHOD_LABELS,
  isCollectionMethod,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
  type ProductCondition,
  type ShippingMethod,
} from "@/lib/enums";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/order/[orderNumber]">) {
  const { orderNumber } = await params;
  const query = await searchParams;

  const order = await getOrderForCustomer(orderNumber);
  if (!order) notFound();

  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const allowed = await canViewOrder(orderNumber, single(query.t));

  if (!allowed) {
    return <OrderLocked orderNumber={order.orderNumber} />;
  }

  const justPlaced = single(query.placed) === "1";
  const returnedFromGateway = single(query.paid) === "1";
  const paymentStatus = order.paymentStatus as PaymentStatus;
  const fulfillmentStatus = order.fulfillmentStatus as FulfillmentStatus;
  const status = order.status as OrderStatus;
  const needsPayment = paymentStatus !== "PAID" && paymentStatus !== "REFUNDED";
  const instructions = getPaymentProvider().customerInstructions ?? [];
  const dateFormat: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "long",
    year: "numeric",
  };

  // `?paid=1` only says "the customer came back from the gateway". It is not
  // evidence of anything, and the customer can type it by hand, so it is never
  // allowed to decide what we claim happened. Only the recorded payment status
  // can. Before the provider's callback lands the honest answer is "checking".
  const awaitingGateway = returnedFromGateway && needsPayment;
  const heading = justPlaced
    ? "Thank you — your order is in"
    : needsPayment
      ? awaitingGateway
        ? "Checking your payment"
        : "Your order"
      : "Payment received";
  const subheading = justPlaced
    ? "Your order is in. We will try to secure the item, then check it before anything ships. The details are on this page."
    : awaitingGateway
      ? "You are back from our payment provider and we are waiting on their confirmation. This page updates as soon as it clears — no need to reload or place another order."
      : "Order details and current status.";

  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: `Order ${order.orderNumber}` }]}
      />

      <div className="mb-8 mt-6 text-center">
        <div
          aria-hidden="true"
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
            needsPayment ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
          }`}
        >
          {needsPayment ? <ClockIcon className="h-7 w-7" /> : <CheckIcon className="h-7 w-7" />}
        </div>

        <h1 className="heading-section text-2xl text-ink-900 sm:text-3xl">{heading}</h1>

        <p className="mt-2 text-ink-600">{subheading}</p>

        <p className="mt-4 inline-block rounded-lg border border-ink-200 bg-white px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Order number{" "}
          </span>
          <span className="ml-2 text-lg font-bold tracking-tight text-ink-900">
            {order.orderNumber}
          </span>
        </p>
      </div>

      {needsPayment && (justPlaced || awaitingGateway) ? (
        <Alert tone="warning" title="Payment is not complete yet" className="mb-6">
          <p>
            {awaitingGateway
              ? "Your order is saved and the item is being held for you. We have not been told by our payment provider that the money has cleared yet, so this order still shows as unpaid."
              : "Your order is saved and the item is being held for you. Payment is arranged manually while the online gateway is being set up."}
          </p>
          {instructions.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {hasWhatsapp() ? (
            <a
              href={whatsappLink(
                `Hi ${brand.name}, I have just placed order ${order.orderNumber} and would like to arrange payment.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm mt-3"
            >
              Message us on WhatsApp
            </a>
          ) : (
            <p className="mt-3 text-sm text-ink-600">
              Keep this page and we will email you once your order is confirmed.
            </p>
          )}
        </Alert>
      ) : null}

      {status === "CANCELLED" || status === "REFUNDED" ? (
        <Alert
          tone="danger"
          title={status === "REFUNDED" ? "This order was refunded" : "This order was cancelled"}
          className="mb-6"
        >
          {order.cancelReason ? (
            <p>
              <strong>Reason:</strong> {order.cancelReason}
            </p>
          ) : null}
          <p className="mt-1">
            {status === "REFUNDED"
              ? "Any amount paid has been returned to you. It can take a few days to show on your statement."
              : "The items have been taken back into stock. If you paid, the refund is being arranged."}
          </p>
        </Alert>
      ) : null}

      <section className="card mb-6 p-5">
        <h2 className="heading-section mb-1 text-base text-ink-900">Where your item is up to</h2>
        <p className="mb-4 text-sm text-ink-600">{ORDER_STATUS_CUSTOMER_MESSAGE[status]}</p>
        <CustomerStepper status={status} />
      </section>

      <section className="card mb-6 p-5">
        <h2 className="heading-section mb-4 text-base text-ink-900">Order status</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Payment</dt>
            <dd className="mt-1">
              <StatusBadge tone={paymentStatus === "PAID" ? "success" : paymentStatus === "UNPAID" ? "warning" : "neutral"}>
                {PAYMENT_STATUS_LABELS[paymentStatus]}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Fulfilment
            </dt>
            <dd className="mt-1">
              <StatusBadge tone={fulfillmentStatus === "DELIVERED" ? "success" : "neutral"}>
                {FULFILLMENT_STATUS_LABELS[fulfillmentStatus]}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Order</dt>
            <dd className="mt-1">
              <StatusBadge
                tone={
                  status === "DELIVERED"
                    ? "success"
                    : status === "CANCELLED" || status === "REFUNDED"
                      ? "danger"
                      : "neutral"
                }
              >
                {ORDER_STATUS_LABELS[status]}
              </StatusBadge>
            </dd>
          </div>
        </dl>

        {order.shippedAt ? (
          <p className="mt-4 border-t border-ink-100 pt-3 text-sm text-ink-600">
            Dispatched on {new Date(order.shippedAt).toLocaleDateString("en-ZA", dateFormat)}
            {order.deliveredAt
              ? ` — delivered on ${new Date(order.deliveredAt).toLocaleDateString("en-ZA", dateFormat)}`
              : ""}
          </p>
        ) : null}

        {order.shipments.some((shipment) => shipment.trackingNumber) ? (
          <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Courier tracking
            </p>
            {order.shipments.map((shipment) =>
              shipment.trackingNumber ? (
                <p key={shipment.id} className="mt-1 text-sm text-ink-900">
                  {shipment.courierName ? `${shipment.courierName}: ` : ""}
                  {shipment.trackingUrl ? (
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-semibold text-brand-700 underline"
                    >
                      {shipment.trackingNumber}
                    </a>
                  ) : (
                    <span className="font-mono font-semibold">{shipment.trackingNumber}</span>
                  )}
                </p>
              ) : null,
            )}
          </div>
        ) : null}
      </section>

      <section className="card mb-6 overflow-hidden">
        <h2 className="heading-section border-b border-ink-100 px-5 py-4 text-base text-ink-900">
          Items in this order
        </h2>

        <ul className="divide-y divide-ink-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-3.5 p-4 sm:p-5">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                {item.imageUrlSnapshot ? (
                  <Image
                    src={item.imageUrlSnapshot}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{item.nameSnapshot}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {item.itemIdSnapshot ? `Item ${item.itemIdSnapshot} · ` : ""}
                  {PRODUCT_CONDITION_LABELS[item.conditionSnapshot as ProductCondition] ??
                    item.conditionSnapshot}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {formatZAR(item.unitPriceCents)} × {item.quantity}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-ink-900 tabular-nums">
                {formatZAR(item.lineTotalCents)}
              </p>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-ink-100 bg-ink-50 p-5">
          <TotalRow label="Items subtotal" value={formatZAR(order.subtotalCents)} />
          <TotalRow
            label={`Delivery (${(SHIPPING_METHOD_LABELS[order.deliveryMethod as ShippingMethod] ?? order.deliveryMethod).toLowerCase()})`}
            value={order.shippingCents === 0 ? "Free" : formatZAR(order.shippingCents)}
          />
          <div className="flex items-center justify-between border-t border-ink-200 pt-2.5">
            <span className="text-base font-bold text-ink-900">Total</span>
            <span className="text-xl font-bold tracking-tight text-ink-900 tabular-nums">
              {formatZAR(order.totalCents)}
            </span>
          </div>
        </div>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="heading-section mb-4 text-base text-ink-900">Delivery details</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Delivering to
            </h3>
            <address className="text-sm not-italic leading-relaxed text-ink-700">
              <span className="font-medium text-ink-900">{order.deliveryFullName}</span>
              <br />
              {order.deliveryLine1}
              <br />
              {order.deliveryLine2 ? (
                <>
                  {order.deliveryLine2}
                  <br />
                </>
              ) : null}
              {order.deliverySuburb}
              <br />
              {order.deliveryCity}, {provinceName(order.deliveryProvince)}{" "}
              {order.deliveryPostalCode}
              <br />
              <span className="text-ink-500">South Africa</span>
            </address>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Contact
            </h3>
            <div className="space-y-1 text-sm text-ink-700">
              <p className="flex items-center gap-1.5">
                <MailIcon className="h-4 w-4 shrink-0 text-ink-400" />
                <a href={`mailto:${order.deliveryEmail}`} className="break-all hover:underline">
                  {order.deliveryEmail}
                </a>
              </p>
              <p className="flex items-center gap-1.5">
                <PhoneIcon className="h-4 w-4 shrink-0 text-ink-400" />
                <a href={`tel:${order.deliveryPhone.replace(/\s/g, "")}`} className="hover:underline">
                  {order.deliveryPhone}
                </a>
              </p>
            </div>

            <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Method
            </h3>
            <p className="text-sm text-ink-700">
              {isCollectionMethod(order.deliveryMethod as ShippingMethod) ? "Locker / kiosk collection" : "Courier to address"}
            </p>
          </div>
        </div>

        {order.deliveryNotes ? (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Your notes
            </h3>
            <p className="whitespace-pre-wrap text-sm text-ink-700">{order.deliveryNotes}</p>
          </div>
        ) : null}
      </section>

      <div className="card p-5 text-center">
        <p className="text-sm text-ink-600">
          Keep your order number{" "}
          <span className="font-semibold">{order.orderNumber}</span> handy if you contact us about this
          order.
        </p>
        <div className="mt-4 flex flex-col justify-center gap-2.5 sm:flex-row">
          {hasWhatsapp() ? (
            <a
              href={whatsappLink(
                `Hi ${brand.name}, I have a question about order ${order.orderNumber}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Contact us about this order
            </a>
          ) : null}
          <Link href="/shop" className="btn btn-secondary">
            Continue shopping
          </Link>
        </div>
        <div className="mt-4 flex justify-center">
          <ContactLinks message={`Hi ${brand.name}, I have a question about order ${order.orderNumber}.`} />
        </div>
      </div>
    </div>
  );
}

function OrderLocked({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="container-page max-w-2xl py-16 sm:py-24">
      <div className="card px-6 py-12 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100"
        >
          <LockIcon className="h-6 w-6 text-ink-400" />
        </div>

        <h1 className="heading-section text-xl text-ink-900">This order is not available on this device</h1>

        <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
          For your privacy we only show an order on the device that placed it. If you used a different
          device or cleared your browser, we can send you the details instead.
        </p>

        <p className="mt-4 inline-block rounded-lg border border-ink-200 bg-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Order number{" "}
          </span>
          <span className="ml-2 font-bold tracking-tight text-ink-900">{orderNumber}</span>
        </p>

        <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
          <a
            href={whatsappLink(`Hi ${brand.name}, I need the details for order ${orderNumber}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Ask us for the details
          </a>
          <Link href="/shop" className="btn btn-secondary">
            Back to the shop
          </Link>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="font-medium text-ink-900 tabular-nums">{value}</span>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const tones = {
    success: "badge-success",
    warning: "badge-accent",
    danger: "badge-danger",
    neutral: "badge-neutral",
  } as const;

  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
