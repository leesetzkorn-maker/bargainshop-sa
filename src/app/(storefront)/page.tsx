import Link from "next/link";
import Image from "next/image";
import {
  UNDER_FIVE_HUNDRED_CENTS,
  getBargainProducts,
  getCategoryTree,
  getFeaturedOrRecent,
  getPriceBucketProducts,
  getRecentProducts,
  listCustomerCatalogue,
  storefrontShowsPhotoDrafts,
  type CatalogProduct,
} from "@/lib/dal/catalog";
import { ProductCard } from "@/components/product-card";
import { SectionHeading } from "@/components/ui";
import { HeroStage } from "@/components/hero-stage";
import { brand, copy, hasAnyContact, hasWhatsapp, whatsappLink } from "@/lib/brand";
import { ContactLinks } from "@/components/contact-links";
import { resolveShowcase, SHOWCASE_CATEGORIES, type Spotlight } from "@/lib/showcase";
import { TRUST_POINTS } from "@/lib/process";
import { formatCustomerPrice, formatZAR } from "@/lib/money";

const SECTION_IDS = {
  gaming: ["2DS-0048", "2DS-0049", "2DS-0050", "2DS-0051", "2DS-0052", "2DS-0053"],
  devices: ["2DS-0046", "2DS-0047", "2DS-0055", "2DS-0067"],
  appliances: ["2DS-0045", "2DS-0056", "2DS-0057", "2DS-0087", "2DS-0088"],
  tools: [
    "2DS-0060", "2DS-0062", "2DS-0063", "2DS-0064", "2DS-0065", "2DS-0066",
    "2DS-0069", "2DS-0071", "2DS-0072", "2DS-0073", "2DS-0077", "2DS-0096",
    "2DS-0097", "2DS-0058", "2DS-0079", "2DS-0080",
  ],
  motor: ["2DS-0061", "2DS-0068", "2DS-0090", "2DS-0092", "2DS-0089"],
  helmets: ["2DS-0081", "2DS-0082", "2DS-0083", "2DS-0084", "2DS-0085", "2DS-0086"],
};

export default async function HomePage() {
  const photoPreview = storefrontShowsPhotoDrafts();
  const categoryTree = await getCategoryTree();
  const liveSlugs = new Set(
    categoryTree.flatMap((main) => [main.slug, ...main.children.map((child) => child.slug)]),
  );
  const catalogue = await listCustomerCatalogue();
  const byId = new Map(catalogue.map((product) => [product.itemId, product]));
  const heroProducts = catalogue.filter((product) =>
    product.stockQty > 0 && product.priceCents > 0 &&
    product.images.some((image) => image.url.startsWith("/uploads/")),
  );
  const rankedHero = [...heroProducts].sort((a, b) =>
    Number(b.isFeatured) - Number(a.isFeatured) ||
    Number(b.priceCents <= UNDER_FIVE_HUNDRED_CENTS) - Number(a.priceCents <= UNDER_FIVE_HUNDRED_CENTS) ||
    Number(b.testingStatus === "TESTED_AND_WORKING") - Number(a.testingStatus === "TESTED_AND_WORKING") ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    a.priceCents - b.priceCents,
  );
  // Lead with a mix of categories, then fill remaining places with ranked deals.
  const seenCategories = new Set<string>();
  const categoryLeaders = rankedHero.filter((product) => {
    if (seenCategories.has(product.category.slug)) return false;
    seenCategories.add(product.category.slug);
    return true;
  });
  const leaderIds = new Set(categoryLeaders.map((product) => product.itemId));
  const selectedHero = [
    ...categoryLeaders,
    ...rankedHero.filter((product) => !leaderIds.has(product.itemId)),
  ].slice(0, 8);
  const heroSpots = spotsFrom(
    new Map(selectedHero.map((product) => [product.itemId, product])),
    selectedHero.map((product) => product.itemId),
  );
  const tiles = photoPreview ? photoTiles(byId) : [];
  const priced = catalogue.filter((product) => product.priceCents > 0);
  const underFiveHundredPhotos = priced.filter((product) => product.priceCents <= UNDER_FIVE_HUNDRED_CENTS);
  const featuredPhotos = [...priced].sort((a, b) => a.priceCents - b.priceCents).slice(0, 8);
  const latestPhotos = [...catalogue].sort((a, b) => b.itemId.localeCompare(a.itemId)).slice(0, 8);

  const [bargains, featured, recent, underFiveHundred] = photoPreview
    ? [[], [], [], []]
    : await Promise.all([
        getBargainProducts(4),
        getFeaturedOrRecent(8),
        getRecentProducts(4),
        getPriceBucketProducts(UNDER_FIVE_HUNDRED_CENTS, 4),
      ]);

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-0" />
        <div className="container-page relative grid items-center gap-6 py-6 sm:py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-8">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-brand-100">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              South African second-hand. Independent store.
            </p>

            <h1 className="heading-display text-3xl text-white sm:text-4xl lg:text-5xl">
              Tested bargains.
              <span className="mt-1 block text-accent-500">Better prices.</span>
            </h1>

            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-200 sm:text-lg">
              {brand.secondary} Shop tools, electronics, appliances and more — real second-hand finds,
              not a catalogue of stock photos.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link href="#products" className="btn btn-accent btn-lg uppercase tracking-wide">
                Shop the latest bargains
                <ArrowIcon className="h-4 w-4" />
              </Link>
              <Link
                href="/how-it-works"
                className="btn btn-lg border border-white/25 text-white uppercase tracking-wide hover:bg-white/10"
              >
                How it works
              </Link>
            </div>

            <form action="/shop" method="get" role="search" className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
              <label htmlFor="home-search" className="sr-only">
                Search products
              </label>
              <input
                id="home-search"
                type="search"
                name="q"
                placeholder="Search drills, phones, kettles…"
                className="h-12 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 text-base text-white placeholder:text-ink-400 focus:border-brand-400 focus:outline-none"
              />
              <button type="submit" className="btn btn-primary h-12">
                Search
              </button>
            </form>
          </div>

          <div className="hidden lg:block">
            <HeroStage items={heroSpots} />
          </div>
        </div>
      </section>

      <div id="products" className="scroll-mt-24">
      {photoPreview ? (
        <>
          <ProductRail
            id="under-500"
            eyebrow="Everyday prices"
            title="Under R500"
            description="Listed only where a selling price is already set, and that price is R500 or less."
            href="/shop?max=500&sort=price-asc"
            products={underFiveHundredPhotos}
          />
          <ProductRail
            id="bargains"
            eyebrow="Lowest prices"
            title="Featured bargains"
            description="The lowest selling prices on these second-hand finds. Items without a selling price stay off this row."
            href="/shop?sort=price-asc"
            products={featuredPhotos}
            tone="white"
          />
          <ProductRail
            id="gaming"
            eyebrow="Consoles and headsets"
            title="Gaming"
            description="The actual consoles, controllers and headsets from this batch."
            href="/shop"
            products={pickIds(byId, SECTION_IDS.gaming)}
          />
          <ProductRail
            id="tools"
            eyebrow="From the bench"
            title="Tools"
            description="The drills, grinders, sanders and toolboxes photographed for this batch."
            href="/shop"
            products={pickIds(byId, SECTION_IDS.tools)}
            tone="white"
          />
          <ProductRail
            id="motor"
            eyebrow="Outside the workshop"
            title="Motor & outdoor"
            description="Pressure washers, the chainsaw, the polisher and the boots. Large items still need a shipping check."
            href="/shop"
            products={pickIds(byId, SECTION_IDS.motor)}
          />
          <ProductRail
            id="helmets"
            eyebrow="R699 each"
            title="Helmets"
            description="Used motorcycle helmets from this batch. Each one is R699. Tested and confirmed working before listing."
            href="/shop"
            products={pickIds(byId, SECTION_IDS.helmets)}
            tone="white"
          />
          <ProductRail
            id="devices"
            eyebrow="Work and calls"
            title="Laptops & Phones"
            description="The laptop, phone and tablet photographed for this batch."
            href="/shop"
            products={pickIds(byId, SECTION_IDS.devices)}
          />
          <ProductRail
            id="appliances"
            eyebrow="For the kitchen and the house"
            title="Appliances"
            description="The vacuum, grill and coffee machine photographed for this batch."
            href="/shop"
            products={pickIds(byId, SECTION_IDS.appliances)}
            tone="white"
          />
          <ProductRail
            id="latest"
            eyebrow="Just in"
            title="Latest bargains"
            description="The newest photographed finds. Shop now opens the listing. Every item stays a draft until it is approved."
            href="/shop?sort=newest"
            products={latestPhotos}
          />
        </>
      ) : null}

      {underFiveHundred.length > 0 ? (
        <section className="container-page py-14 sm:py-16">
          <SectionHeading
            eyebrow="Everyday prices"
            title="Under R500"
            description={`Real listings at ${formatZAR(UNDER_FIVE_HUNDRED_CENTS)} or less. Most are one-off.`}
            action={
              <Link href="/shop?max=500&sort=price-asc" className="btn btn-secondary btn-sm shrink-0">
                Everything under R500
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {underFiveHundred.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {bargains.length > 0 ? (
        <section className="border-y border-ink-200 bg-white py-14 sm:py-16">
          <div className="container-page">
            <SectionHeading
              eyebrow="Lowest prices"
              title="Featured bargains"
              description="The lowest-priced second-hand finds currently listed. When a one-off is gone, it is gone."
              action={
                <Link href="/shop?sort=price-asc" className="btn btn-secondary btn-sm shrink-0">
                  See all bargains
                </Link>
              }
            />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {bargains.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {featured.length > 0 ? (
        <section className="container-page py-14 sm:py-16">
          <SectionHeading
            eyebrow="Picked out"
            title="Worth a closer look"
            description="Second-hand items with an honest condition grade. Each one is checked before it ships."
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="container-page pb-14 sm:pb-16">
          <SectionHeading
            eyebrow="Just listed"
            title="Recently added"
            action={
              <Link href="/shop?sort=newest" className="btn btn-secondary btn-sm shrink-0">
                All new arrivals
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {recent.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      </div>

      <section id="categories" className="container-page py-6 sm:py-8">
        <SectionHeading
          eyebrow="Browse"
          title="Shop by what you need"
          description={
            photoPreview
              ? "Photographs of the actual items. Second-hand, tested where the badge says so, and not affiliated with the product brands."
              : "Real second-hand categories. The photographs show the kind of item — 2DE BARGAINS is not affiliated with any product brand."
          }
          action={
            <Link href="/categories" className="btn btn-secondary btn-sm shrink-0">
              All categories
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {(tiles.length > 0 ? tiles : resolveShowcase(SHOWCASE_CATEGORIES, liveSlugs)).map((category) => (
            <Link
              key={category.id}
              href={category.href}
              className={`group relative aspect-[4/3] overflow-hidden rounded-2xl shadow-[var(--shadow-card)] sm:aspect-[16/9] ${
                category.image.startsWith("/uploads/") ? "bg-white" : "bg-ink-900"
              }`}
            >
              <Image
                src={category.image}
                alt={category.alt}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={
                  category.image.startsWith("/uploads/")
                    ? "object-contain bg-white p-4 transition-transform duration-500 group-hover:scale-105"
                    : "object-cover transition-transform duration-500 group-hover:scale-105"
                }
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                <h3 className="font-display text-base font-bold text-white sm:text-lg">{category.label}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-b border-ink-200 bg-white" aria-label="Why shop here">
        <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-3 py-4 sm:grid-cols-3 lg:grid-cols-6">
          {TRUST_POINTS.map((point) => (
            <li key={point.title} className="min-w-0 py-1">
              <p className="text-sm font-semibold text-ink-900">
                <span aria-hidden="true" className="mr-1.5 text-brand-700">
                  ✓
                </span>
                {point.title}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-ink-500">{point.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-ink-200 bg-white py-8 sm:py-10">
        <div className="container-page">
          <SectionHeading eyebrow="Easy shopping" title="Find it. Order it. Enjoy it." />
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { title: "Choose your bargain", body: "See the actual item, its price and its condition before you order." },
              { title: "Order online", body: "Delivery is shown at checkout. We confirm availability and check your item before shipping." },
              { title: "Delivered to you", body: "We pack your bargain and send tracking once it is dispatched." },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3 rounded-xl bg-ink-50 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-accent-500">{index + 1}</span>
                <div>
                  <h3 className="text-sm font-bold text-ink-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs leading-relaxed text-ink-600">
            Second-hand items, sold in the condition described. Subject to availability; unavailable items are refunded.
            Your statutory consumer rights apply. <Link href="/terms" className="font-semibold underline">Terms</Link>
            {" · "}<Link href="/returns" className="font-semibold underline">Returns</Link>
            {" · "}<Link href="/how-it-works" className="font-semibold underline">How it works</Link>
          </p>
        </div>
      </section>

      <section className="border-t border-ink-200 bg-brand-50 py-14 sm:py-16">
        <div className="container-page">
          <div className="card mx-auto max-w-3xl p-6 text-center sm:p-10">
            <h2 className="heading-section text-2xl text-ink-900 sm:text-3xl">
              Not sure an item will work for you?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-600">
              Message us with the item number. We will tell you honestly what the listing says, including
              the limits of a pre-shipping check.
            </p>

            {hasAnyContact() ? (
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                {hasWhatsapp() ? (
                  <a
                    href={whatsappLink(
                      `Hi ${brand.name}, I have a question about one of your second-hand items.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-lg"
                  >
                    Chat on WhatsApp
                  </a>
                ) : null}
                <Link href="/contact" className="btn btn-secondary btn-lg">
                  All contact options
                </Link>
              </div>
            ) : (
              <div className="mt-7 rounded-lg border border-ink-200 bg-ink-50 p-4">
                <p className="text-sm text-ink-600">
                  Direct contact details are still being confirmed. Use the contact page, or place an
                  order and we will reach you about it.
                </p>
              </div>
            )}

            <ContactLinks
              variant="stacked"
              className="mt-6 items-center justify-center"
              message={`Hi ${brand.name}, I have a question about one of your second-hand items.`}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function pickIds(byId: Map<string, CatalogProduct>, ids: string[]): CatalogProduct[] {
  return ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
}

function spotsFrom(byId: Map<string, CatalogProduct>, ids: string[]): Spotlight[] {
  return pickIds(byId, ids).flatMap((product) => {
    const image = product.images.find((candidate) => candidate.url.startsWith("/uploads/"));
    if (!image) return [];
    return [
      {
        id: product.itemId,
        label: product.name,
        href: `/product/${product.slug}`,
        image: image.url,
        alt: image.alt ?? product.name,
        priceLabel: formatCustomerPrice(product.priceCents),
        kicker: product.testingStatus === "TESTED_AND_WORKING" ? "Tested & working" : undefined,
      },
    ];
  });
}

function photoTiles(byId: Map<string, CatalogProduct>): Spotlight[] {
  const specs = [
    { id: "gaming", label: "Gaming", href: "#gaming", itemId: "2DS-0048" },
    { id: "devices", label: "Laptops & Phones", href: "#devices", itemId: "2DS-0055" },
    { id: "appliances", label: "Appliances", href: "#appliances", itemId: "2DS-0057" },
    { id: "tools", label: "Tools", href: "#tools", itemId: "2DS-0060" },
    { id: "motor", label: "Motor & outdoor", href: "#motor", itemId: "2DS-0090" },
    { id: "helmets", label: "Helmets", href: "#helmets", itemId: "2DS-0081" },
    { id: "under-500", label: "Bargains Under R500", href: "#under-500", itemId: "2DS-0072" },
    { id: "latest", label: "Latest bargains", href: "#latest", itemId: "2DS-0096" },
  ];
  return specs.flatMap((spec) => {
    const product = byId.get(spec.itemId);
    const image = product?.images[0];
    if (!product || !image) return [];
    return [{ ...spec, image: image.url, alt: image.alt ?? product.name }];
  });
}

function ProductRail({
  id,
  eyebrow,
  title,
  description,
  href,
  products,
  tone = "plain",
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  products: CatalogProduct[];
  tone?: "plain" | "white";
}) {
  if (products.length === 0) return null;
  const inner = (
    <>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <Link href={href} className="btn btn-accent btn-sm shrink-0">
            Shop now
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} priority={index < 2} />
        ))}
      </div>
    </>
  );
  if (tone === "white") {
    return (
      <section id={id} className="border-y border-ink-200 bg-white py-14 sm:py-16">
        <div className="container-page">{inner}</div>
      </section>
    );
  }
  return (
    <section id={id} className="container-page py-14 sm:py-16">
      {inner}
    </section>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 0 1 .75-.75h9.19L9.72 6.03a.75.75 0 0 1 1.06-1.06l4.5 4.25a.75.75 0 0 1 0 1.06l-4.5 4.25a.75.75 0 1 1-1.06-1.06l3.22-3.03H3.75A.75.75 0 0 1 3 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
