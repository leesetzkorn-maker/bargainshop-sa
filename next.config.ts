import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "100mb" } },

  serverExternalPackages: ["@prisma/client", "bcryptjs"],

  images: {
    // Product images are self-hosted by default (uploads land in /public/uploads).
    // Add remotePatterns here when you move media to a CDN / object storage.
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
    // Next 16 restricts the default allow-list to [75]; opt the common set back in.
    qualities: [50, 75, 100],
    deviceSizes: [360, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // `search: ""` means no query string is allowed on these paths. That is
    // correct here: every upload is stored under a content-unique filename
    // (see storeProductImage in src/lib/storage.ts), so a replaced image gets a
    // new URL and needs no cache-busting parameter.
    localPatterns: [
      { pathname: "/uploads/**", search: "" },
      { pathname: "/placeholder/**", search: "" },
      { pathname: "/media/**", search: "" },
      { pathname: "/brand/**", search: "" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
