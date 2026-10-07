/**
 * Generates the placeholder product/category artwork shipped with the demo seed.
 *
 * These are deliberate placeholders, not photographs: the real store must upload
 * genuine photos of the actual second-hand items. Run with:
 *   npx tsx scripts/maintenance/generate-placeholders.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "placeholder");

interface Spec {
  slug: string;
  label: string;
  glyph: string;
  hue: number;
}

const SPECS: Spec[] = [
  {
    slug: "power-tools",
    label: "Power tool",
    hue: 210,
    glyph: `<path d="M96 168h136a12 12 0 0 0 12-12v-40a12 12 0 0 0-12-12h-52l-14-30a20 20 0 0 0-18-11h-30a20 20 0 0 0-20 20v73a12 12 0 0 0 12 12Z" fill="none" stroke="hsl(210 30% 32%)" stroke-width="9" stroke-linejoin="round"/><rect x="60" y="176" width="26" height="46" rx="9" fill="hsl(210 30% 32%)"/><path d="M244 148h34a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10h-34" fill="none" stroke="hsl(210 30% 32%)" stroke-width="9"/>`,
  },
  {
    slug: "battery-drills",
    label: "Battery drill",
    hue: 268,
    glyph: `<rect x="104" y="86" width="140" height="96" rx="18" fill="none" stroke="hsl(268 28% 36%)" stroke-width="9"/><path d="M104 150h-26a10 10 0 0 0-10 10v22a10 10 0 0 0 10 10h26" fill="none" stroke="hsl(268 28% 36%)" stroke-width="9"/><path d="M244 126h30a9 9 0 0 1 9 9v22a9 9 0 0 1-9 9h-30" fill="none" stroke="hsl(268 28% 36%)" stroke-width="9"/><rect x="140" y="182" width="66" height="42" rx="10" fill="hsl(268 28% 36%)"/>`,
  },
  {
    slug: "grinders",
    label: "Angle grinder",
    hue: 14,
    glyph: `<path d="M118 108h96a14 14 0 0 1 14 14v40a14 14 0 0 1-14 14h-30l-18 44h-58l22-44h-12a14 14 0 0 1-14-14v-40a14 14 0 0 1 14-14Z" fill="none" stroke="hsl(14 30% 36%)" stroke-width="9" stroke-linejoin="round"/><circle cx="128" cy="196" r="26" fill="none" stroke="hsl(14 30% 36%)" stroke-width="9"/><path d="M228 142h34" stroke="hsl(14 30% 36%)" stroke-width="9" stroke-linecap="round"/>`,
  },
  {
    slug: "electrical-tools",
    label: "Electrical tool",
    hue: 46,
    glyph: `<path d="M166 78v40" stroke="hsl(46 34% 30%)" stroke-width="10" stroke-linecap="round"/><path d="M150 104l-24 44h40l-16 46 52-64h-38l22-26Z" fill="none" stroke="hsl(46 34% 30%)" stroke-width="9" stroke-linejoin="round"/><rect x="120" y="196" width="92" height="30" rx="10" fill="none" stroke="hsl(46 34% 30%)" stroke-width="9"/>`,
  },
  {
    slug: "jacks",
    label: "Jack & lifting",
    hue: 200,
    glyph: `<rect x="86" y="176" width="160" height="34" rx="10" fill="none" stroke="hsl(200 28% 32%)" stroke-width="9"/><path d="M166 176v-42M166 134l-54 42M166 134l54 42" fill="none" stroke="hsl(200 28% 32%)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><rect x="146" y="72" width="40" height="18" rx="6" fill="hsl(200 28% 32%)"/>`,
  },
  {
    slug: "spanners",
    label: "Spanners & hand tools",
    hue: 24,
    glyph: `<path d="M104 96a34 34 0 0 0 34 34c6 0 11-1 16-4l84 84a22 22 0 0 0 31-31l-84-84c3-5 4-10 4-16a34 34 0 0 0-34-34l18 18-22 22-18-18Z" fill="none" stroke="hsl(24 30% 34%)" stroke-width="9" stroke-linejoin="round"/>`,
  },
  {
    slug: "toolboxes",
    label: "Toolbox",
    hue: 28,
    glyph: `<path d="M72 122h188a10 10 0 0 1 10 10v76a10 10 0 0 1-10 10H72a10 10 0 0 1-10-10v-76a10 10 0 0 1 10-10Z" fill="none" stroke="hsl(28 32% 32%)" stroke-width="9"/><path d="M134 122V96a12 12 0 0 1 12-12h40a12 12 0 0 1 12 12v26" fill="none" stroke="hsl(28 32% 32%)" stroke-width="9" stroke-linecap="round"/><path d="M118 160h96" stroke="hsl(28 32% 32%)" stroke-width="9" stroke-linecap="round"/>`,
  },
  {
    slug: "small-appliances",
    label: "Small appliance",
    hue: 340,
    glyph: `<rect x="96" y="80" width="140" height="132" rx="20" fill="none" stroke="hsl(340 26% 36%)" stroke-width="9"/><circle cx="166" cy="140" r="34" fill="none" stroke="hsl(340 26% 36%)" stroke-width="9"/><path d="M120 190h92" stroke="hsl(340 26% 36%)" stroke-width="9" stroke-linecap="round"/>`,
  },
  {
    slug: "air-fryers",
    label: "Air fryer",
    hue: 8,
    glyph: `<path d="M112 74h108a14 14 0 0 1 14 14v104a14 14 0 0 1-14 14h-108a14 14 0 0 1-14-14V88a14 14 0 0 1 14-14Z" fill="none" stroke="hsl(8 32% 38%)" stroke-width="9"/><path d="M132 116h68M132 142h68" stroke="hsl(8 32% 38%)" stroke-width="8" stroke-linecap="round"/><rect x="140" y="168" width="52" height="14" rx="7" fill="hsl(8 32% 38%)"/>`,
  },
  {
    slug: "small-electronics",
    label: "Small electronics",
    hue: 188,
    glyph: `<rect x="70" y="98" width="192" height="96" rx="14" fill="none" stroke="hsl(188 30% 28%)" stroke-width="9"/><path d="M104 130h96M104 158h60" stroke="hsl(188 30% 28%)" stroke-width="8" stroke-linecap="round"/><path d="M250 130v32" stroke="hsl(188 30% 28%)" stroke-width="8" stroke-linecap="round"/>`,
  },
  {
    slug: "car-accessories",
    label: "Car accessory",
    hue: 222,
    glyph: `<path d="M64 178h204a12 12 0 0 0 11-8l14-44a12 12 0 0 0-11-16H98a12 12 0 0 0-11 8l-14 44a12 12 0 0 0-9 16Z" fill="none" stroke="hsl(222 26% 34%)" stroke-width="9" stroke-linejoin="round"/><path d="M118 110l24-34h48l26 34" fill="none" stroke="hsl(222 26% 34%)" stroke-width="9" stroke-linejoin="round"/><circle cx="104" cy="190" r="18" fill="none" stroke="hsl(222 26% 34%)" stroke-width="9"/><circle cx="228" cy="190" r="18" fill="none" stroke="hsl(222 26% 34%)" stroke-width="9"/>`,
  },
  {
    slug: "household",
    label: "Household item",
    hue: 160,
    glyph: `<path d="M166 78 86 148h24v58h112v-58h24L166 78Z" fill="none" stroke="hsl(160 28% 28%)" stroke-width="9" stroke-linejoin="round"/><path d="M146 206v-44h40v44" fill="none" stroke="hsl(160 28% 28%)" stroke-width="9" stroke-linejoin="round"/>`,
  },
  {
    slug: "pet-products",
    label: "Pet product",
    hue: 32,
    glyph: `<ellipse cx="132" cy="118" rx="18" ry="24" fill="none" stroke="hsl(32 34% 32%)" stroke-width="9"/><ellipse cx="200" cy="118" rx="18" ry="24" fill="none" stroke="hsl(32 34% 32%)" stroke-width="9"/><ellipse cx="100" cy="160" rx="16" ry="22" fill="none" stroke="hsl(32 34% 32%)" stroke-width="9"/><ellipse cx="232" cy="160" rx="16" ry="22" fill="none" stroke="hsl(32 34% 32%)" stroke-width="9"/><path d="M132 146c8 18 24 26 34 26s26-8 34-26" fill="none" stroke="hsl(32 34% 32%)" stroke-width="9" stroke-linecap="round"/>`,
  },
  {
    slug: "other-bargains",
    label: "Other bargain",
    hue: 96,
    glyph: `<path d="M166 74l26 54 60 8-44 42 11 60-53-30-53 30 11-60-44-42 60-8 26-54Z" fill="none" stroke="hsl(96 24% 30%)" stroke-width="9" stroke-linejoin="round"/>`,
  },
];

function render(spec: Spec, index: number): string {
  const bg1 = `hsl(${spec.hue} 42% 96%)`;
  const bg2 = `hsl(${spec.hue} 34% 90%)`;
  const badgeBg = `hsl(${spec.hue} 40% 88%)`;
  const badgeText = `hsl(${spec.hue} 32% 26%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="${spec.label} placeholder">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="300" cy="290" r="176" fill="#ffffff" opacity="0.55"/>
  <g>${spec.glyph}</g>
  <g>
    <rect x="180" y="482" width="240" height="40" rx="20" fill="${badgeBg}"/>
    <text x="300" y="507" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="17" font-weight="600" fill="${badgeText}">${spec.label}</text>
  </g>
  <text x="300" y="556" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" fill="${badgeText}" opacity="0.7">Placeholder image ${index + 1}</text>
</svg>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [index, spec] of SPECS.entries()) {
    await writeFile(join(OUT_DIR, `${spec.slug}.svg`), render(spec, index), "utf8");
  }

  // Two neutral angles per category so a seeded product has a multi-image grid.
  for (const [index, spec] of SPECS.entries()) {
    const alt = { ...spec, hue: (spec.hue + 18) % 360 };
    await writeFile(join(OUT_DIR, `${spec.slug}-2.svg`), render(alt, index + 1), "utf8");
    const alt2 = { ...spec, hue: (spec.hue + 336) % 360 };
    await writeFile(join(OUT_DIR, `${spec.slug}-3.svg`), render(alt2, index + 2), "utf8");
  }

  // Social sharing card.
  const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="2de Store">
  <defs>
    <linearGradient id="og" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f3a31"/>
      <stop offset="100%" stop-color="#145044"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#og)"/>
  <text x="80" y="250" font-family="ui-sans-serif, system-ui, sans-serif" font-size="76" font-weight="800" fill="#ffffff">2de Store</text>
  <text x="80" y="330" font-family="ui-sans-serif, system-ui, sans-serif" font-size="38" font-weight="600" fill="#d6f0e7">Quality Second-Hand Finds. Better Prices.</text>
  <text x="80" y="400" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26" fill="#a8a29e">Tools, appliances and electronics — delivered across South Africa</text>
</svg>
`;
  await writeFile(join(process.cwd(), "public", "og-default.svg"), og, "utf8");

  console.log(`Generated ${SPECS.length * 3 + 1} placeholder images in public/placeholder`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
