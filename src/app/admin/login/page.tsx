import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { currentAdmin } from "@/lib/dal/admin";
import { safeAdminPath } from "@/app/actions/admin";
import { LoginForm } from "@/components/admin/login-form";
import { one } from "@/components/admin/format";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = await safeAdminPath(one(query.next));
  const admin = await currentAdmin();
  if (admin) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-sm font-bold tracking-widest text-brand-700 uppercase">{brand.name}</p>
        <h1 className="heading-section mt-2 text-3xl text-ink-900">Admin sign in</h1>
        <p className="mt-2 mb-6 text-sm text-ink-600">
          Private area for stock, orders and profit. Customers cannot see this.
        </p>
        <LoginForm next={next === "/admin" ? undefined : next} />
      </div>
    </main>
  );
}
