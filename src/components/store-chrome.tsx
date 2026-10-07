"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brand, contact, hasPhone, hasWhatsapp, telHref, whatsappLink } from "@/lib/brand";
import { ContactLinks } from "@/components/contact-links";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

interface NavCategory {
  name: string;
  slug: string;
}

const NAV_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "Categories", href: "/categories" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Delivery", href: "/shipping" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export function StoreHeader({
  categories,
  cartCount,
}: {
  categories: NavCategory[];
  cartCount: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close everything on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
    setCategoriesOpen(false);
  }

  // Escape closes the desktop dropdown.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCategoriesOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!categoriesOpen) return;
    function onClick(event: MouseEvent) {
      if (categoriesRef.current && !categoriesRef.current.contains(event.target as Node)) {
        setCategoriesOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [categoriesOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function openCategories() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setCategoriesOpen(true);
  }

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setCategoriesOpen(false), 140);
  }

  return (
    <>
      {/* Announcement bar — sets expectations immediately */}
      <div className="bg-ink-900 text-white">
        <div className="container-page flex items-center justify-center gap-2 py-2 text-center text-xs font-medium sm:text-[13px]">
          <span className="hidden sm:inline">
            The Courier Guy delivery — estimated 1–3 working days depending on destination and service.
          </span>
          <span className="sm:hidden">The Courier Guy — estimated 1–3 working days.</span>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-ink-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="container-page">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link href="/" className="flex shrink-0 items-center" aria-label={`${brand.name} home`}>
              <Logo />
            </Link>

            {/* Desktop nav */}
            <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
              <div
                ref={categoriesRef}
                className="relative"
                onMouseEnter={openCategories}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  onClick={() => setCategoriesOpen((v) => !v)}
                  aria-expanded={categoriesOpen}
                  aria-haspopup="true"
                  className="btn btn-ghost btn-sm"
                >
                  Categories
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className={cn("h-3.5 w-3.5 transition-transform", categoriesOpen && "rotate-180")}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {categoriesOpen ? (
                  <div
                    className="absolute left-1/2 top-full w-[26rem] -translate-x-1/2 pt-2"
                    onMouseEnter={openCategories}
                    onMouseLeave={scheduleClose}
                  >
                    <div className="card grid grid-cols-2 gap-1 p-2 shadow-[var(--shadow-pop)]">
                      {categories.map((category) => (
                        <Link
                          key={category.slug}
                          href={`/category/${category.slug}`}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                        >
                          {category.name}
                        </Link>
                      ))}
                      <Link
                        href="/categories"
                        className="col-span-2 mt-1 rounded-lg border-t border-ink-100 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        View all categories →
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>

              {NAV_LINKS.filter((l) => l.href !== "/categories").map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "btn btn-ghost btn-sm",
                      active && "bg-brand-50 text-brand-800",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-1.5">
              {hasWhatsapp() ? (
                <a
                  href={whatsappLink(
                    `Hi ${brand.name}, I have a question about an item on your website.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm hidden sm:inline-flex"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  WhatsApp
                </a>
              ) : null}

              <Link
                href="/cart"
                className="btn btn-secondary btn-sm relative"
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
              >
                <CartIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Cart</span>
                {cartCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                ) : null}
              </Link>

              <button
                type="button"
                className="btn btn-ghost btn-sm lg:hidden"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
              >
                {mobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div
            id="mobile-nav"
            className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-ink-200 bg-white lg:hidden"
          >
            <nav aria-label="Mobile" className="container-page py-4">
              <p className="mb-2 px-3 text-xs font-bold uppercase tracking-widest text-ink-400">
                Categories
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/category/${category.slug}`}
                    className="rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-700"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>

              <p className="mb-2 mt-5 px-3 text-xs font-bold uppercase tracking-widest text-ink-400">
                Menu
              </p>
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-lg px-3 py-2.5 text-base font-medium text-ink-800 hover:bg-ink-50"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              {hasWhatsapp() ? (
                <a
                  href={whatsappLink(`Hi ${brand.name}, I need help with an order.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary mt-5 w-full"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Chat on WhatsApp
                </a>
              ) : null}
              {hasPhone() ? (
                <p className="mt-3 px-3 text-center text-sm text-ink-500">
                  or call{" "}
                  <a href={telHref()} className="font-semibold text-brand-700">
                    {contact.phone}
                  </a>
                </p>
              ) : null}
            </nav>
          </div>
        ) : null}
      </header>
    </>
  );
}

export function StoreFooter() {
  const year = new Date().getFullYear();

  const shopLinks = [
    { label: "All products", href: "/shop" },
    { label: "Categories", href: "/categories" },
    { label: "Featured bargains", href: "/shop?featured=1" },
    { label: "Recently added", href: "/shop?sort=newest" },
  ];

  const helpLinks = [
    { label: "How it works", href: "/how-it-works" },
    { label: "Shipping policy", href: "/shipping" },
    { label: "Refund policy", href: "/returns" },
    { label: "Contact us", href: "/contact" },
    { label: "About us", href: "/about" },
  ];

  const legalLinks = [
    { label: "Privacy policy", href: "/privacy" },
    { label: "Terms & conditions", href: "/terms" },
  ];

  return (
    <footer className="mt-auto border-t border-ink-200 bg-white">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Link href="/" className="inline-flex">
              <Logo />
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">{brand.description}</p>
            {hasWhatsapp() ? (
              <a
                href={whatsappLink(`Hi ${brand.name}, I have a question.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm mt-4"
              >
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp us
              </a>
            ) : null}
          </div>

          <FooterColumn title="Shop" links={shopLinks} />
          <FooterColumn title="Help" links={helpLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        {/* Reinforce the business model — customers must not confuse us with a pawn shop */}
        <div className="mt-10 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-900">We sell second-hand goods. We are not a pawn shop.</p>
          <p className="mt-1 text-sm text-brand-800">
            We source good second-hand stock and sell it online. We do not take items as loans and we do not
            buy items from the public through this website.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-ink-100 pt-6 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {brand.name}. {brand.preferredDomain}
          </p>
          <ContactLinks message={`Hi ${brand.name}, I have a question.`} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-900">{title}</h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-ink-600 hover:text-ink-900 hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Icons (inline, no icon library dependency)
function CartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path d="M2.5 3h1.6a1 1 0 0 1 .98.8L5.4 6m0 0 1.6 8.4a2 2 0 0 0 1.95 1.6h7.7a2 2 0 0 0 1.96-1.6L20 8H5.4Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="20" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.15h-.01c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23Z" />
    </svg>
  );
}
