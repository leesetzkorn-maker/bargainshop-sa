import Link from "next/link";
import { requireAdmin } from "@/lib/dal/admin";
import { prisma } from "@/lib/db";
import { formatZAR } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const days = [1, 7, 30].includes(Number(params.days)) ? Number(params.days) : 7;
  const today = new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
  const since = new Date(`${today}T00:00:00+02:00`);
  since.setUTCDate(since.getUTCDate() - days + 1);
  const where = { createdAt: { gte: since } };
  const [sessions, paths, sources, devices, recent, paid, failed, pending, first] = await Promise.all([
    prisma.analyticsEvent.groupBy({ by: ["sessionId", "kind", "path"], where }),
    prisma.analyticsEvent.groupBy({ by: ["path"], where: { ...where, kind: "page_view" }, _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 15 }),
    prisma.analyticsEvent.groupBy({ by: ["sessionId", "source"], where: { ...where, kind: "page_view" } }),
    prisma.analyticsEvent.groupBy({ by: ["sessionId", "device"], where: { ...where, kind: "page_view" } }),
    prisma.analyticsEvent.groupBy({ by: ["sessionId"], where: { kind: "page_view", createdAt: { gte: new Date(Date.now() - 5 * 60000) } } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID", paidAt: { gte: since } }, _count: { _all: true }, _sum: { totalCents: true } }),
    prisma.order.count({ where: { placedAt: { gte: since }, paymentStatus: "FAILED" } }),
    prisma.order.count({ where: { placedAt: { gte: since }, paymentStatus: { in: ["UNPAID", "PENDING", "AUTHORISED"] } } }),
    prisma.analyticsEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const count = (test: (row: typeof sessions[number]) => boolean) => new Set(sessions.filter(test).map(row => row.sessionId)).size;
  const visits = count(row => row.kind === "page_view");
  const carts = new Set(sessions.filter(row => row.kind === "add_to_cart").map(row => row.sessionId));
  const paying = new Set(sessions.filter(row => row.kind === "payment_started").map(row => row.sessionId));
  const cartWithoutPayment = [...carts].filter(id => !paying.has(id)).length;
  const stages: [string, number][] = [
    ["Visited the store", visits],
    ["Viewed a product", count(row => row.kind === "page_view" && row.path.startsWith("/product/"))],
    ["Added to cart / Buy now", carts.size],
    ["Opened checkout", count(row => row.kind === "page_view" && row.path === "/checkout")],
    ["Created an order for payment", paying.size],
    ["Saw a checkout error", count(row => row.kind === "checkout_error")],
  ];
  const sourceCounts = new Map<string, number>();
  for (const row of sources) sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
  const deviceCounts = new Map<string, number>();
  for (const row of devices) deviceCounts.set(row.device, (deviceCounts.get(row.device) ?? 0) + 1);
  const cards: [string, string | number][] = [["Visits (30-minute sessions)", visits], ["Page views", paths.length ? await prisma.analyticsEvent.count({ where: { ...where, kind: "page_view" } }) : 0], ["Viewed a page in last 5 minutes", recent.length], ["Paid orders", paid._count._all], ["Paid order value", formatZAR(paid._sum.totalCents ?? 0)], ["Unpaid / pending orders", pending], ["Failed payment orders", failed], ["Cart sessions without payment start", cartWithoutPayment]];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-section text-2xl">Store Analytics</h1>
        <div className="flex gap-2">{[1, 7, 30].map(n => <Link key={n} href={`/admin/analytics?days=${n}`} className={`btn btn-sm ${days === n ? "btn-primary" : "btn-secondary"}`}>{n === 1 ? "Today" : `${n} days`}</Link>)}</div>
      </div>
      <p className="text-sm text-ink-600">South African time. Refresh this page for updated numbers. Signed-in admins and known bots are excluded from visit tracking. Visits are sessions, not unique people.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-ink-200 bg-white p-4"><p className="text-sm text-ink-600">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
      {!first && <p className="rounded-xl bg-white p-4">Tracking is ready. No visitor activity has been recorded yet. Older visits cannot be reconstructed.</p>}
      {first && <p className="text-sm text-ink-600">Visit tracking started {first.createdAt.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}. Older visits are unavailable. Payment totals use actual order records and include earlier orders in the selected period; they are order value, not profit.</p>}
      <section className="rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="text-lg font-bold">Shopping progress</h2>
        <p className="my-2 text-sm text-ink-600">Sessions reaching each step during this period. Customers may skip steps with Buy now. A cart without a payment start is an indicator, not proof of abandonment.</p>
        {stages.map(([label, value]) => <div key={label} className="my-3"><div className="flex justify-between text-sm"><span>{label}</span><strong>{value}</strong></div><div className="mt-1 h-2 rounded bg-ink-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${visits ? Math.min(100, value / visits * 100) : 0}%` }} /></div></div>)}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-white p-4"><h2 className="mb-3 text-lg font-bold">Top pages and products</h2>{paths.length ? <table className="w-full text-left text-sm"><thead><tr><th>Page</th><th className="text-right">Views</th></tr></thead><tbody>{paths.map(row => <tr key={row.path} className="border-t border-ink-100"><td className="break-all py-2">{row.path}</td><td className="text-right">{row._count._all}</td></tr>)}</tbody></table> : <p>No page views yet.</p>}</section>
        <section className="rounded-xl border border-ink-200 bg-white p-4"><h2 className="mb-3 text-lg font-bold">Where visits come from</h2><p className="mb-3 text-sm text-ink-600">Referring website only. Direct includes apps that hide their referrer.</p>{[...sourceCounts].sort((a,b) => b[1]-a[1]).slice(0,15).map(([source, number]) => <p key={source} className="flex justify-between border-t border-ink-100 py-2 text-sm"><span className="break-all">{source}</span><strong>{number}</strong></p>)}<h3 className="mt-5 font-bold">Devices</h3>{[...deviceCounts].map(([device, number]) => <p key={device} className="flex justify-between py-2 text-sm"><span>{device}</span><strong>{number}</strong></p>)}</section>
      </div>
    </div>
  );
}
