import { StoreFooter, StoreHeader } from "@/components/store-chrome";
import { getActiveCategories } from "@/lib/dal/catalog";
import { readCart } from "@/lib/cart";

// Catalogue queries require the mounted production volume. The cart already
// makes these pages dynamic; declare it before any parallel database reads.
export const dynamic = "force-dynamic";

export default async function StorefrontLayout({ children }: LayoutProps<"/">) {
  const [categories, cart] = await Promise.all([getActiveCategories(), readCart()]);

  const cartCount = cart.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <StoreHeader
        categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
        cartCount={cartCount}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <StoreFooter />
    </>
  );
}
