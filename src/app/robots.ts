import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private areas and transactional pages have nothing useful to index and
        // some of them are order-specific.
        disallow: ["/admin", "/api/", "/cart", "/checkout", "/order/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
