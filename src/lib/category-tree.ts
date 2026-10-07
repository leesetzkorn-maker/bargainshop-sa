/**
 * The house category tree. Single source of truth.
 *
 * This list is imported by `prisma/seed.ts`, by `scripts/migrate-house-data.ts`,
 * and it is what the admin category form is checked against. It used to be
 * duplicated in two files, which is how a fresh `db:seed` quietly produced a
 * different taxonomy from the live database.
 *
 * Two levels only. A third level would make the nav and the breadcrumbs worse
 * without helping anyone find a second-hand tool faster.
 */

export interface CategoryNode {
  slug: string;
  name: string;
  description: string;
  children: ReadonlyArray<{ slug: string; name: string }>;
}

/** The eight main categories from the business plan, in nav order. */
export const CATEGORY_TREE: ReadonlyArray<CategoryNode> = [
  {
    slug: "power-tools",
    name: "Power Tools",
    description:
      "Second-hand drills, grinders, saws and sanders. Tested before listing and graded honestly.",
    children: [
      { slug: "battery-drills", name: "Battery Drills" },
      { slug: "grinders", name: "Angle Grinders" },
    ],
  },
  {
    slug: "electrical-tools",
    name: "Electrical Tools",
    description:
      "Second-hand pressure washers, planers, routers and other mains-powered tools that are still worth having.",
    children: [],
  },
  {
    slug: "hand-tools",
    name: "Hand Tools",
    description:
      "Spanners, sockets, screwdrivers, pliers, hammers and toolboxes — the stuff that never stays on the shelf.",
    children: [
      { slug: "spanners", name: "Spanners & Hand Tools" },
      { slug: "toolboxes", name: "Toolboxes & Storage" },
    ],
  },
  {
    slug: "automotive-tools",
    name: "Automotive Tools",
    description:
      "Jacks, trolley jacks, wheel-alignment kit, car jacks and workshop tools that are built to last.",
    children: [
      { slug: "jacks", name: "Jacks" },
      { slug: "car-accessories", name: "Car Accessories" },
    ],
  },
  {
    slug: "kitchen-appliances",
    name: "Kitchen Appliances",
    description:
      "Second-hand air fryers, kettles, toasters, microwaves and other kitchen workhorses at a fraction of new price.",
    children: [{ slug: "air-fryers", name: "Air Fryers" }],
  },
  {
    slug: "home-small-appliances",
    name: "Home & Small Appliances",
    description:
      "Everyday household appliances and small domestic items, cleaned, tested and priced to match their condition.",
    children: [
      { slug: "small-appliances", name: "Small Appliances" },
      { slug: "household", name: "Household & Home" },
      { slug: "pet-products", name: "Pet & Home Extras" },
    ],
  },
  {
    slug: "electronics",
    name: "Electronics",
    description:
      "Second-hand electronics and small gadgets, checked and working. Stock is one-of-a-kind, so buy early.",
    children: [{ slug: "small-electronics", name: "Small Electronics" }],
  },
  {
    slug: "other-bargains",
    name: "Other Bargains",
    description:
      "Everything else worth a second life — odd ends, useful extras and stock we simply could not leave behind.",
    children: [],
  },
];

/** Every slug in the tree, mains and children together. */
export const CATEGORY_SLUGS: ReadonlySet<string> = new Set(
  CATEGORY_TREE.flatMap((main) => [main.slug, ...main.children.map((child) => child.slug)]),
);

/** Slug -> parent slug, or null for a main category. */
export const CATEGORY_PARENT: ReadonlyMap<string, string | null> = new Map(
  CATEGORY_TREE.flatMap((main) => [
    [main.slug, null] as const,
    ...main.children.map((child) => [child.slug, main.slug] as const),
  ]),
);

