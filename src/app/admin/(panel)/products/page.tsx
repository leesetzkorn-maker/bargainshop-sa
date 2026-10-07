import Link from "next/link";
import { formatZAR } from "@/lib/money";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS } from "@/lib/enums";
import { listAdminCategories, listAdminProducts, getCatalogueReadinessSummary } from "@/lib/dal/admin";
import { getPricingSettings } from "@/lib/dal/pricing";
import { pricingBreakdown } from "@/lib/pricing";
import { setProductStatusAction } from "@/app/actions/admin";
import { one } from "@/components/admin/format";
import { Notice, PageHeader, StatusPill } from "@/components/admin/ui";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const [summary, pricing] = await Promise.all([getCatalogueReadinessSummary(), getPricingSettings()]);
  const q = one(query.q);
  const status = one(query.status);
  const categoryId = one(query.category);
  const page = Math.max(1, Number.parseInt(one(query.page) ?? "1", 10) || 1);
  const [catalog, categories] = await Promise.all([
    listAdminProducts({
      query: q,
      status: status && PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number]) ? status : undefined,
      categoryId,
      lowStockOnly: one(query.low) === "1",
      page,
    }),
    listAdminCategories(),
  ]);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (categoryId) params.set("category", categoryId);
  if (one(query.low) === "1") params.set("low", "1");

  return (
    <>
      <PageHeader title="Products" description="Source cost and profit stay on this side of the site.">
        <Link href="/admin/products/new" className="btn btn-primary">
          Add product
        </Link>
      </PageHeader>
      <Notice error={one(query.error)} saved={one(query.saved) === "1"} />
      <div className="my-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(summary).map(([label, count]) => <div className="card p-3" key={label}><p className="text-xs text-ink-500">{label}</p><p className="text-xl font-bold">{count}</p></div>)}</div>
      <p className="mb-4 text-xs text-ink-500">Flags overlap. Archived examples are excluded. NEEDS IMAGE means a clean exact-model image still needs permission or editing; actual-item photos must be retained.</p>

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" action="/admin/products">
        <input className="input" name="q" defaultValue={q ?? ""} placeholder="Search name, item ID or SKU" />
        <select className="input" name="status" defaultValue={status ?? ""}>
          <option value="">Any status</option>
          {PRODUCT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PRODUCT_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select className="input" name="category" defaultValue={categoryId ?? ""}>
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          Filter
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Ready</th>
              <th className="px-4 py-3 font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Cost</th>
              <th className="px-4 py-3 font-semibold">Profit</th>
              <th className="px-4 py-3 font-semibold">Stock</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {catalog.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-ink-500">
                  No products match.
                </td>
              </tr>
            ) : (
              catalog.rows.map((product) => {
                const profit = pricingBreakdown(product.sourceCostCents, product.priceCents, pricing).grossProfitCents;
                return (
                  <tr key={product.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/products/${product.id}`} className="font-semibold text-ink-900">
                        {product.name}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {product.itemId} · {product.category.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill value={product.status} />
                    </td>
                    <td className="px-4 py-3">
                      {product.readinessIssues.length === 0 ? (
                        <span className="text-xs font-semibold text-emerald-700">Ready</span>
                      ) : (
                        <span
                          className="text-xs font-semibold text-amber-700"
                          title={product.readinessIssues.map((issue) => issue.message).join("\n")}
                        >
                          {product.catalogueFlags.join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatZAR(product.priceCents)}</td>
                    <td className="px-4 py-3">{product.sourceCostCents == null ? "—" : formatZAR(product.sourceCostCents)}</td>
                    <td className="px-4 py-3">{profit == null ? "—" : formatZAR(profit)}</td>
                    <td className="px-4 py-3">{product.stockQty}</td>
                    <td className="px-4 py-3 text-right">
                      {product.status === "ACTIVE" ? (
                        <form action={setProductStatusAction}>
                          <input type="hidden" name="id" value={product.id} />
                          <input type="hidden" name="status" value="SOLD_OUT" />
                          <input type="hidden" name="back" value="/admin/products" />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            Mark sold
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {catalog.pageCount > 1 ? (
        <nav className="mt-4 flex gap-2" aria-label="Pages">
          {Array.from({ length: catalog.pageCount }, (_, index) => {
            const next = new URLSearchParams(params);
            next.set("page", String(index + 1));
            return (
              <Link
                key={index}
                href={`/admin/products?${next.toString()}`}
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
