import Link from "next/link";
import { notFound } from "next/navigation";
import { formatZAR } from "@/lib/money";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_TEMPLATE_LABELS,
  FULFILLMENT_STATUSES,
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES_CLOSED,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABELS,
  provinceName,
} from "@/lib/enums";
import { getAdminOrder, orderProfitCents } from "@/lib/dal/admin";
import {
  addOrderNoteAction,
  cancelOrderAction,
  markItemsUnavailableAction,
  quickOrderAction,
  refundOrderAction,
  saveShipmentAction,
  updateOrderAction,
} from "@/app/actions/admin";
import { formatWhen, one } from "@/components/admin/format";
import { Field, Notice, PageHeader, StatusPill } from "@/components/admin/ui";
import { WorkflowStepper } from "@/components/admin/workflow-stepper";

/**
 * The quick actions offered at each step of the pipeline.
 *
 * Only the actions that make sense right now are shown, so the operator cannot
 * mark an order shipped while the item has not been secured yet. The destructive
 * actions (cancel, refund, item lost) deliberately live further down the page.
 */
function nextActions(status: string, paid: boolean): ReadonlyArray<readonly [string, string]> {
  if (ORDER_STATUSES_CLOSED.includes(status as never)) return [];
  if (status === "PENDING_PAYMENT") {
    return paid ? [["checking-stock", "Start checking stock"]] : [["paid", "Record payment received"]];
  }
  if (status === "PAID") return [["checking-stock", "Start checking stock"]];
  if (status === "CHECKING_STOCK") return [["secured", "Item secured — all stock in"]];
  if (status === "ITEM_SECURED") return [["preparing", "Start packing"]];
  if (status === "PREPARING_SHIPMENT") return [["shipped", "Handed to courier"]];
  if (status === "SHIPPED") return [["delivered", "Mark delivered"]];
  return [];
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const order = await getAdminOrder(id);
  if (!order) notFound();

  const closed = ORDER_STATUSES_CLOSED.includes(order.status as never);
  const paid = order.paymentStatus === "PAID";
  const actions = nextActions(order.status, paid);
  const profit = orderProfitCents(order.items);
  const shipment = order.shipments[0];
  const address = [
    order.deliveryLine1,
    order.deliveryLine2,
    order.deliverySuburb,
    order.deliveryCity,
    provinceName(order.deliveryProvince),
    order.deliveryPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  // Only steps that have actually happened, so an unpaid order shows a short list
  // instead of a column of empty dates.
  const timeline: Array<{ label: string; at: Date }> = [
    { label: "Order placed", at: order.placedAt },
    { label: "Payment received", at: order.paidAt },
    { label: "Stock checked", at: order.stockCheckedAt },
    { label: "Item secured", at: order.securedAt },
    { label: "Handed to courier", at: order.shippedAt },
    { label: "Delivered", at: order.deliveredAt },
    { label: "Refunded", at: order.refundedAt },
  ].filter((entry): entry is { label: string; at: Date } => entry.at != null);

  return (
    <>
      <PageHeader title={order.orderNumber} description={formatWhen(order.placedAt)}>
        <StatusPill value={order.status} />
        <Link href={`/order/${order.orderNumber}`} className="btn btn-secondary">
          Customer page
        </Link>
      </PageHeader>
      <Notice error={one(query.error)} saved={one(query.saved) === "1"} />

      <section className="card mb-6 border-brand-200 bg-brand-50 p-5">
        <p className="text-base font-semibold text-ink-900">
          {order.customer.fullName} {paid ? "paid for" : "ordered"}{" "}
          {order.items.map((item) => `${item.itemIdSnapshot} (${item.nameSnapshot})`).join(", ")} and wants it
          delivered to {address}.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          {order.deliveryEmail} · {order.deliveryPhone} ·{" "}
          {order.deliveryMethod === "LOCKER" ? "Locker delivery" : "Courier delivery"}
        </p>
      </section>

      {order.cancelReason ? (
        <section className="card mb-6 border-danger-200 bg-danger-50 p-4">
          <h2 className="font-bold text-danger-900">Why this order was closed</h2>
          <p className="mt-1 text-sm text-danger-800">{order.cancelReason}</p>
        </section>
      ) : null}

      <div className="mb-6 space-y-4">
        <WorkflowStepper status={order.status} />

        {actions.length > 0 ? (
          <div className="card p-5">
            <h2 className="font-bold text-ink-900">What happens next</h2>
            <p className="mt-1 text-sm text-ink-600">
              {paid && order.status === "PENDING_PAYMENT"
                ? "Money is in. Start sourcing the item so the customer knows you are on it."
                : "Advance this order one step. Each step tells the customer where their item is."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map(([intent, label]) => (
                <form key={intent} action={quickOrderAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="intent" value={intent} />
                  <button type="submit" className="btn btn-primary btn-sm">
                    {label}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ) : null}

        {closed ? null : (
          <div className="card border-danger-200 p-5">
            <h2 className="font-bold text-ink-900">We could not get the item</h2>
            <p className="mt-1 text-sm text-ink-600">
              Tick the items you cannot source. They are taken off the storefront so nobody else orders them,
              the units come back, and the order is closed with a reason the customer can read.
            </p>
            <form action={markItemsUnavailableAction} className="mt-3 space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <fieldset className="space-y-2">
                <legend className="sr-only">Items that are no longer available</legend>
                {order.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm"
                  >
                    <input type="checkbox" name="productIds" value={item.productId} />
                    <span className="font-semibold text-ink-900">{item.itemIdSnapshot}</span>
                    <span className="truncate text-ink-600">{item.nameSnapshot}</span>
                  </label>
                ))}
              </fieldset>
              <Field label="Why could you not get it?" hint="The customer sees this reason.">
                <input
                  className="input"
                  name="reason"
                  required
                  minLength={5}
                  maxLength={300}
                  placeholder="Supplier no longer stocks this model"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
                <input type="checkbox" name="refund" defaultChecked />
                Refund the customer in full
              </label>
              <button type="submit" className="btn btn-danger btn-sm">
                Mark unavailable and close order
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Item ID</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Qty</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Source cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold">{item.itemIdSnapshot}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${item.productId}`}
                        className="font-semibold text-ink-900"
                      >
                        {item.nameSnapshot}
                      </Link>
                      <p className="text-xs text-ink-500">{item.skuSnapshot}</p>
                      {item.unavailableReason ? (
                        <p className="mt-1 text-xs font-semibold text-danger-700">
                          Unavailable: {item.unavailableReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{item.quantity}</td>
                    <td className="px-4 py-3">{formatZAR(item.lineTotalCents)}</td>
                    <td className="px-4 py-3">
                      {item.unitSourceCostCents == null
                        ? "—"
                        : formatZAR(item.unitSourceCostCents * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="grid gap-2 border-t border-ink-200 px-4 py-4 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Items</dt>
                <dd>{formatZAR(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Shipping</dt>
                <dd>{formatZAR(order.shippingCents)}</dd>
              </div>
              <div className="flex justify-between gap-3 font-bold">
                <dt>Total</dt>
                <dd>{formatZAR(order.totalCents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Private profit</dt>
                <dd>{profit ? formatZAR(profit.profitCents) : "No source cost recorded"}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-bold text-ink-900">Tracking</h2>
            <form action={saveShipmentAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="orderId" value={order.id} />
              {shipment ? <input type="hidden" name="shipmentId" value={shipment.id} /> : null}
              <Field label="Courier name">
                <input
                  className="input"
                  name="courierName"
                  defaultValue={shipment?.courierName ?? "The Courier Guy"}
                />
              </Field>
              <Field label="Tracking number">
                <input
                  className="input"
                  name="trackingNumber"
                  defaultValue={shipment?.trackingNumber ?? ""}
                />
              </Field>
              <Field label="Shipment status">
                <select className="input" name="status" defaultValue={shipment?.status ?? "PENDING"}>
                  {SHIPMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {SHIPMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Private dispatch note">
                <input className="input" name="notes" defaultValue={shipment?.notes ?? ""} />
              </Field>
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-secondary" disabled={closed}>
                  Save tracking
                </button>
              </div>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="font-bold text-ink-900">Emails sent</h2>
            <p className="mt-1 text-sm text-ink-600">
              What this order actually triggered. A failed send is shown as failed rather than hidden, so a
              customer who did not get an email is never a mystery.
            </p>
            {order.emails.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No emails recorded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-100">
                {order.emails.map((email) => (
                  <li key={email.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <StatusPill value={email.status} />
                    <span className="font-semibold text-ink-900">
                      {EMAIL_TEMPLATE_LABELS[email.template as never] ?? email.template}
                    </span>
                    <span className="text-ink-600">{email.to}</span>
                    <span className="ml-auto text-xs text-ink-500">{formatWhen(email.createdAt)}</span>
                    {email.error ? (
                      <p className="w-full text-xs text-danger-700">{email.error}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-500">
              Statuses: {Object.values(EMAIL_STATUS_LABELS).join(" · ")}
            </p>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5 text-sm">
            <h2 className="font-bold text-ink-900">Customer</h2>
            <p className="mt-2 font-semibold">{order.customer.fullName}</p>
            <p>{order.customer.email}</p>
            <p>{order.customer.phone}</p>
            <p className="mt-2 text-ink-700">{address}</p>
            {order.deliveryNotes ? (
              <p className="mt-2 text-ink-600">Customer note: {order.deliveryNotes}</p>
            ) : null}
            <Link
              href={`/admin/customers/${order.customer.id}`}
              className="mt-3 inline-block font-semibold text-brand-700"
            >
              Customer history
            </Link>
          </section>

          <section className="card p-5">
            <h2 className="font-bold text-ink-900">Timeline</h2>
            {timeline.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Nothing has happened yet.</p>
            ) : (
              <ol className="mt-2 space-y-2 text-sm">
                {timeline.map(({ label, at }) => (
                  <li key={label} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-700">{label}</span>
                    <span className="text-xs text-ink-500">{formatWhen(at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-bold text-ink-900">Status override</h2>
            <p className="mt-1 text-sm text-ink-600">
              Prefer the buttons above. Use this only to correct a mistake — every change emails the customer.
            </p>
            <form action={updateOrderAction} className="mt-3 space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Order">
                <select className="input" name="orderStatus" defaultValue={order.status} disabled={closed}>
                  {ORDER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ORDER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment">
                <select
                  className="input"
                  name="paymentStatus"
                  defaultValue={order.paymentStatus}
                  disabled={closed}
                >
                  {PAYMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PAYMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fulfilment">
                <select
                  className="input"
                  name="fulfillmentStatus"
                  defaultValue={order.fulfillmentStatus}
                  disabled={closed}
                >
                  {FULFILLMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {FULFILLMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Internal notes">
                <textarea
                  className="input min-h-24"
                  name="internalNotes"
                  defaultValue={order.internalNotes ?? ""}
                />
              </Field>
              <button type="submit" className="btn btn-primary" disabled={closed}>
                Save status
              </button>
            </form>
          </section>

          {!closed ? (
            <>
              <section className="card border-danger-200 p-5">
                <h2 className="font-bold text-ink-900">Refund in full</h2>
                <p className="mt-1 text-sm text-ink-600">
                  Marks the payment refunded, returns the units to stock and closes the order. The actual
                  money movement happens in your payment provider.
                </p>
                <form action={refundOrderAction} className="mt-3 space-y-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <Field label="Reason (optional)">
                    <input className="input" name="reason" maxLength={300} placeholder="Faulty on arrival" />
                  </Field>
                  <button type="submit" className="btn btn-danger btn-sm">
                    Refund order
                  </button>
                </form>
              </section>

              <section className="card border-danger-200 p-5">
                <h2 className="font-bold text-ink-900">Cancel without refund</h2>
                <p className="mt-1 text-sm text-ink-600">
                  Closes the order. Use this for a customer who walked away, or when you are handling the
                  refund by hand.
                </p>
                <form action={cancelOrderAction} className="mt-3 space-y-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <Field label="Reason (optional)">
                    <input className="input" name="reason" maxLength={300} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
                    <input type="checkbox" name="restock" defaultChecked />
                    Put the items back in stock
                  </label>
                  <button type="submit" className="btn btn-danger btn-sm">
                    Cancel order
                  </button>
                </form>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-bold text-ink-900">Staff notes</h2>
        <form action={addOrderNoteAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="orderId" value={order.id} />
          <input className="input" name="body" placeholder="Only staff can see this" required />
          <button type="submit" className="btn btn-secondary">
            Add note
          </button>
        </form>
        <ul className="mt-4 space-y-3">
          {order.notes.length === 0 ? <li className="text-sm text-ink-500">No notes yet.</li> : null}
          {order.notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
              <p>{note.body}</p>
              <p className="mt-1 text-xs text-ink-500">
                {note.author?.name ?? "Staff"} · {formatWhen(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
