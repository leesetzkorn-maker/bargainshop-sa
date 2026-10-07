import Link from "next/link";
import { formatZAR } from "@/lib/money";
import {
  getAttentionProducts,
  getDashboardStats,
  getRecentOrders,
} from "@/lib/dal/admin";
import { ATTENTION_HINT, productStatusHint } from "@/lib/enums";
import { formatWhen } from "@/components/admin/format";
import { PageHeader, StatusPill } from "@/components/admin/ui";

export default async function AdminDashboardPage() {
  const [stats, orders, attention] = await Promise.all([
    getDashboardStats(),
    getRecentOrders(8),
    getAttentionProducts(6),
  ]);

  const cards = [
    {
      label: "Paid revenue, 30 days",
      value: formatZAR(stats.revenueCents),
      hint: `${stats.orderCount} paid orders`,
      href: "/admin/orders?paymentStatus=PAID",
    },
    {
      label: "Profit, 30 days",
      value: formatZAR(stats.profitCents),
      hint: `${stats.marginPct}% margin after source cost`,
      href: "/admin/orders?paymentStatus=PAID",
    },
    {
      label: "Awaiting payment",
      value: formatZAR(stats.awaitingPaymentCents),
      hint: `${stats.awaitingPaymentCount} orders to follow up`,
      href: "/admin/orders?paymentStatus=UNPAID",
    },
    {
      label: "Need sourcing",
      value: String(stats.actionRequiredCount),
      hint: "paid, item not secured yet",
      // These are the orders where the customer has already paid but we have not
      // yet confirmed the item is still on the shelf at the shop. That is the
      // single most important queue in the business: every one of them is money
      // taken and an item not yet secured.
      href: "/admin/orders?status=PAID",
      highlight: stats.actionRequiredCount > 0,
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Money here counts only orders that have actually been paid. Source cost stays private."
      >
        <Link href="/admin/products/new" className="btn btn-primary">
          Add product
        </Link>
        <Link href="/admin/orders" className="btn btn-secondary">
          View orders
        </Link>
      </PageHeader>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`card p-4 transition hover:border-brand-300 hover:shadow-sm ${
              card.highlight ? "border-brand-300 bg-brand-50/40" : ""
            }`}
          >
            <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{card.value}</p>
            <p className="mt-1 text-sm text-ink-600">{card.hint}</p>
          </Link>
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h2 className="font-bold text-ink-900">Recent orders</h2>
            <Link href="/admin/orders" className="text-sm font-semibold text-brand-700">
              All orders
            </Link>
          </div>
          <ul className="divide-y divide-ink-100">
            {orders.length === 0 ? (
              <li className="px-4 py-8 text-sm text-ink-500">No orders yet.</li>
            ) : (
              orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ink-50"
                  >
                    <span className="font-semibold text-ink-900">{order.orderNumber}</span>
                    <span className="text-sm text-ink-600">{order.customer.fullName}</span>
                    <StatusPill value={order.status} />
                    <StatusPill value={order.paymentStatus} />
                    <span className="ml-auto text-sm font-semibold">{formatZAR(order.totalCents)}</span>
                    <span className="w-full text-xs text-ink-500 sm:w-auto">
                      {formatWhen(order.placedAt)}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <div>
              <h2 className="font-bold text-ink-900">Needs attention</h2>
              <p className="text-xs text-ink-500">{ATTENTION_HINT}</p>
            </div>
            <Link href="/admin/products" className="text-sm font-semibold text-brand-700">
              All
            </Link>
          </div>
          <ul className="divide-y divide-ink-100">
            {attention.length === 0 ? (
              <li className="px-4 py-8 text-sm text-ink-500">
                Nothing needs a decision. Every listing is either live or sold.
              </li>
            ) : (
              attention.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-900">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {product.itemId} · {productStatusHint(product.status)}
                      </span>
                    </span>
                    <StatusPill value={product.status} />
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
