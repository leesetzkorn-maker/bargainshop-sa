import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { brand, copy } from "@/lib/brand";
import { BUYING_STEPS, DISPATCH_PROMISE, TEST_CHECKS } from "@/lib/process";

export const metadata: Metadata = {
  title: "How buying works",
  description: `How ordering second-hand from ${brand.name} works: find a bargain, pay on the site, we secure it, test it, then ship it.`,
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <InfoPage
      title="How buying works"
      breadcrumbs={[{ label: "How it works" }]}
      intro={copy.whatWeDo}
      sections={[
        {
          heading: "The six steps",
          body: (
            <ol className="space-y-5">
              {BUYING_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-ink-900">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          ),
        },
        {
          heading: DISPATCH_PROMISE.title,
          body: (
            <>
              <p>{DISPATCH_PROMISE.lead}</p>
              <p>
                <strong>{DISPATCH_PROMISE.processing}</strong> {DISPATCH_PROMISE.testing}
              </p>
              <p>{DISPATCH_PROMISE.tracking}</p>
              <p>{DISPATCH_PROMISE.stock}</p>
            </>
          ),
        },
        {
          heading: "What a check actually covers",
          body: (
            <>
              <p>
                Every item is checked and confirmed working before it is prepared for shipping. A
                check is not a refurbishment, and it is not a promise that every hidden fault can be
                found.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {TEST_CHECKS.map((row) => (
                  <li key={row.item}>
                    <strong>{row.item}:</strong> {row.check}
                  </li>
                ))}
              </ul>
              <p>A listing stays marked “Testing required” until that check has actually been done.</p>
            </>
          ),
        },
        {
          heading: "If we cannot secure the item",
          body: (
            <p>
              {copy.whyItemsDisappear}{" "}
              <Link href="/returns" className="font-semibold text-brand-700 hover:underline">
                Refund policy
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Do I need an account?",
          body: (
            <p>
              No. You check out as a guest. We keep your name, email, phone and delivery address
              against the order so we can fulfil it and contact you about it.
            </p>
          ),
        },
        {
          heading: "Can I cancel?",
          body: (
            <p>
              Contact us with your order number as soon as you can. A cancellation can be accepted
              before the item has been secured, checked and handed to the courier. After that, see the{" "}
              <Link href="/returns" className="font-semibold text-brand-700 hover:underline">
                refund policy
              </Link>
              . Nothing on this page removes a right you may have under applicable law.
            </p>
          ),
        },
        {
          heading: "Is this a pawn shop?",
          body: <p>{copy.notAPawnShop} Items are sourced from our second-hand supplier after you order.</p>,
        },
      ]}
    >
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-ink-600">Ready to see what is in stock?</p>
        <Link href="/shop" className="btn btn-primary">
          Shop bargains
        </Link>
      </div>
      <div className="mt-6">
        <PolicyLinks />
      </div>
    </InfoPage>
  );
}
