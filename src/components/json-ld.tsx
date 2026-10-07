/** JSON-LD helpers for structured data. */

export function BreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function OrganizationJsonLd(input: {
  name: string;
  url: string;
  description: string;
  email: string;
  phone: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: input.name,
    url: input.url,
    description: input.description,
    email: input.email,
    telephone: input.phone,
    areaServed: { "@type": "Country", name: "South Africa" },
    currenciesAccepted: "ZAR",
  };
}

export function ItemListJsonLd(
  items: Array<{ name: string; url: string; image?: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: item.url,
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

export function WebSiteJsonLd(input: { name: string; url: string }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: input.url,
    inLanguage: "en-ZA",
  };
}
