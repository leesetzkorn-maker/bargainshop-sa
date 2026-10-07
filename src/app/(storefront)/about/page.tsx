import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { brand, copy } from "@/lib/brand";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "About us",
  description: `How ${brand.name} works: we source good-condition second-hand stock and sell it online at better prices than new.`,
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const [stock, categoryCount] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.category.count({ where: { isActive: true } }),
  ]);

  return (
    <InfoPage
      title={`About ${brand.name}`}
      breadcrumbs={[{ label: "About" }]}
      intro={brand.description}
      sections={[
        {
          heading: "What we do",
          body: (
            <>
              <p>{copy.whatWeDo}</p>
              <p>
                Everything listed on this site is second-hand. We grade each item honestly —{" "}
                <strong>Excellent</strong>, <strong>Good</strong> or <strong>Fair</strong> — and the
                grade is shown on every product page, so you know exactly what you are getting before
                you buy it.
              </p>
              <p>
                Most of our stock is one-off. When a one-off is gone, it is genuinely gone, and we do
                not back-order or substitute it without asking you first.
              </p>
            </>
          ),
        },
        {
          heading: "Why second-hand is worth it",
          body: (
            <>
              <p>
                Buying used means a device or tool that already did its job, at a price that reflects
                that — not a discount sticker on something that was never used. Quality used stock is
                also the fastest way to get the thing you actually need.
              </p>
              <p>
                We check every item is functional before it goes online. What we cannot verify to a
                laboratory standard — battery health on an older laptop, say — we tell you about
                plainly rather than claiming perfection.
              </p>
            </>
          ),
        },
        {
          heading: "What we are not",
          body: (
            <>
              <p>
                We are <strong>not a pawn shop</strong>. We do not lend money, we do not take your
                goods as security, and we do not buy from the public through this website. Anything
                we list was bought or sourced by us first.
              </p>
              <p>
                We are also not a rental business and we do not offer finance. If you see a price and
                want to pay in instalments, that is a conversation to have with your bank, not with
                us.
              </p>
            </>
          ),
        },
        {
          heading: "Right now",
          body: (
            <p>
              We currently have{" "}
              <strong>
                {stock} item{stock === 1 ? "" : "s"}
              </strong>{" "}
              available across{" "}
              <strong>
                {categoryCount} categor{categoryCount === 1 ? "y" : "ies"}
              </strong>
              . New stock comes in regularly, so it is worth{" "}
              <Link href="/shop" className="font-semibold text-brand-700 hover:underline">
                browsing the shop
              </Link>{" "}
              even if you are not ready to buy today.
            </p>
          ),
        },
      ]}
    >
      <PolicyLinks />
    </InfoPage>
  );
}
