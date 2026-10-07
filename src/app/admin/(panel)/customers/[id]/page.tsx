import Link from "next/link";
import { notFound } from "next/navigation";
import { formatZAR } from "@/lib/money";
import { provinceName } from "@/lib/enums";
import { getAdminCustomer } from "@/lib/dal/admin";
import { formatWhen } from "@/components/admin/format";
import { PageHeader, StatusPill } from "@/components/admin/ui";

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getAdminCustomer(id);
  if (!customer) notFound();

  return (
    <>
      <PageHeader title={customer.fullName} description={`Customer since ${formatWhen(customer.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 text-sm lg:col-span-1">
          <h2 className="font-bold text-ink-900">Contact</h2>
          <p className="mt-2">{customer.email}</p>
          <p>{customer.phone}</p>
          <h2 className="mt-5 font-bold text-ink-900">Addresses</h2>
          <ul className="mt-2 space-y-3">
            {customer.addresses.length === 0 ? <li className="text-ink-500">No saved address.</li> : null}
            {customer.addresses.map((address) => (
              <li key={address.id}>
                <p>
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                </p>
                <p>
                  {address.suburb}, {address.city}
                </p>
                <p>
                  {provinceName(address.province)} {address.postalCode}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card overflow-x-auto lg:col-span-2">
          <h2 className="border-b border-ink-200 px-4 py-3 font-bold text-ink-900">Orders</h2>
          <table className="w-full min-w-[520px] text-left text-sm">
            <tbody className="divide-y divide-ink-100">
              {customer.orders.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-ink-500">No orders.</td>
                </tr>
              ) : (
                customer.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="font-semibold text-ink-900">
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-ink-500">{formatWhen(order.placedAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill value={order.paymentStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill value={order.fulfillmentStatus} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatZAR(order.totalCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
