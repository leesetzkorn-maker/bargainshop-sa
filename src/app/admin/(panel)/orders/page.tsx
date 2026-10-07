import Link from "next/link";
import { formatZAR } from "@/lib/money";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  provinceName,
} from "@/lib/enums";
import { listAdminOrders } from "@/lib/dal/admin";
import { formatWhen, one } from "@/components/admin/format";
import { Notice, PageHeader, StatusPill } from "@/components/admin/ui";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = one(query.q);
  const status = one(query.status);
  const paymentStatus = one(query.paymentStatus);
  const page = Math.max(1, Number.parseInt(one(query.page) ?? "1", 10) || 1);
  const catalog = await listAdminOrders({
    query: q,
    status: status && ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number]) ? status : undefined,
    // The dashboard tiles deep-link in here with ?paymentStatus=, so this has to
    // honour it. Without it, "Paid revenue" and "Awaiting payment" both opened
    // the unfiltered list and the numbers on the tiles could not be checked.
    paymentStatus:
      paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as (typeof PAYMENT_STATUSES)[number])
        ? paymentStatus
        : undefined,
    page,
  });

  return (
    <>
      <PageHeader
        title="Orders"
        description="Each row is a customer, the item they bought, and where it must be delivered."
      />
      <Notice error={one(query.error)} saved={one(query.saved) === "1"} />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" action="/admin/orders">
        <input className="input" name="q" defaultValue={q ?? ""} placeholder="Order number, name, email or phone" />
        <select className="input" name="status" defaultValue={status ?? ""}>
          <option value="">Any status</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select className="input" name="paymentStatus" defaultValue={paymentStatus ?? ""}>
          <option value="">Any payment</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PAYMENT_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          Filter
        </button>
      </form>

      {q || status || paymentStatus ? (
        <p className="mb-4 text-sm text-ink-500">
          <Link href="/admin/orders" className="font-semibold text-brand-700 hover:underline">
            Clear filters
          </Link>
        </p>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Deliver to</th>
              <th className="px-4 py-3 font-semibold">Payment</th>
              <th className="px-4 py-3 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {catalog.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-ink-500">
                  No orders match.
                </td>
              </tr>
            ) : (
              catalog.rows.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-semibold text-ink-900">
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-ink-500">
                      {formatWhen(order.placedAt)} · {order._count.items} item{order._count.items === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{order.customer.fullName}</p>
                    <p className="text-xs text-ink-500">{order.customer.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    {order.deliveryCity}, {provinceName(order.deliveryProvince)}
                    <p className="text-xs text-ink-500">{order.deliveryMethod === "LOCKER" ? "Locker" : "Courier"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill value={order.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatZAR(order.totalCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {catalog.pageCount > 1 ? (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Pages">
          {Array.from({ length: catalog.pageCount }, (_, index) => {
            const next = new URLSearchParams();
            if (q) next.set("q", q);
            if (status) next.set("status", status);
            if (paymentStatus) next.set("paymentStatus", paymentStatus);
            next.set("page", String(index + 1));
            return (
              <Link
                key={index}
                href={`/admin/orders?${next.toString()}`}
                className={index + 1 === catalog.page ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              >
                {index + 1}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
