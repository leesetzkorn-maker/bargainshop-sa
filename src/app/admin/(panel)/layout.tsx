import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { currentAdmin } from "@/lib/dal/admin";
import { AdminNav } from "@/components/admin/nav";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="container-page flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/admin" className="heading-section text-lg text-ink-900">
            {brand.name}
            <span className="ml-2 text-sm font-semibold text-ink-500">Admin</span>
          </Link>
          <AdminNav />
        </div>
      </header>
      <p className="border-b border-ink-200 bg-white">
        <span className="container-page block py-2 text-xs text-ink-500">
          Signed in as {admin.name} · {admin.email}
        </span>
      </p>
      <main className="container-page py-6 sm:py-8">{children}</main>
    </div>
  );
}
