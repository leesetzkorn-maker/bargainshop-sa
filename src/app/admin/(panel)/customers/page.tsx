import Link from "next/link";
import { formatZAR } from "@/lib/money";
import { listAdminCustomers } from "@/lib/dal/admin";
import { formatWhen, one } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/ui";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = one(query.q);
  const customers = await listAdminCustomers(q);

  return (
    <>
      <PageHeader title="Customers" description="People who have checked out. This is not a public directory." />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/admin/customers">
        <input className="input" name="q" defaultValue={q ?? ""} placeholder="Search name, email or phone" />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Orders</th>
              <th className="px-4 py-3 font-semibold">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-ink-500">
                  No customers yet.
                </td>
              </tr>
            ) : (
              customers.map((customer) => {
                const latest = customer.orders[0];
                return (
                  <tr key={customer.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${customer.id}`} className="font-semibold text-ink-900">
                        {customer.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p>{customer.email}</p>
                      <p className="text-xs text-ink-500">{customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">{customer._count.orders}</td>
                    <td className="px-4 py-3">
                      {latest ? (
                        <>
                          <p>{latest.orderNumber}</p>
                          <p className="text-xs text-ink-500">
                            {formatZAR(latest.totalCents)} · {formatWhen(latest.placedAt)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
