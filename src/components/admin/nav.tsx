"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/admin";
import { cn } from "@/lib/utils";

const LINKS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/intake", label: "Intake" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/shipping", label: "Shipping" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      <nav className="flex items-center gap-1" aria-label="Admin">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100",
              )}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-600 hover:bg-ink-100">
        View store
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="btn btn-ghost btn-sm">
          Log out
        </button>
      </form>
    </div>
  );
}
