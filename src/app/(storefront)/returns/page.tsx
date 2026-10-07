import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { brand, contactBlurb, hasWhatsapp, whatsappLink } from "@/lib/brand";
import { legalAddressLines, legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund policy",
  description: `What happens if ${brand.name} cannot secure an item, it fails a pre-shipping check, or something arrives damaged or incorrect.`,
  alternates: { canonical: "/returns" },
};

export default function ReturnsPage() {
  const address = legalAddressLines();

  return (
    <InfoPage
      title="Refund policy"
      breadcrumbs={[{ label: "Refunds" }]}
      requiresLegalReview
      intro="These are genuine second-hand bargains. Stock can change quickly, and items are checked before they ship. This page explains what we do. It is written so it can be checked against South African consumer law before the store launches. It does not take away any right you may have under that law."
      sections={[
        {
          heading: "Something arrived broken or not working",
          body: (
            <>
              <p>
                Contact us within{" "}
                <strong>7 days</strong> of delivery with your order number, a short description of
                the fault and a photo if you have one. We will sort out a repair, a replacement or a
                refund, and we will pay the return postage.
              </p>
              <p>
                <strong>Do not return a faulty item before speaking to us.</strong> Tell us it is
                faulty first and we will tell you where to send it and how. Returning an unagreed
                parcel usually means it gets lost, and that slows everything down.
              </p>
            </>
          ),
        },
        {
          heading: "If we cannot secure the item",
          body: (
            <p>
              The physical item is sourced after you order. If the supplier no longer has it, we tell
              you, cancel the order, and refund what you paid according to this policy. We do not
              substitute a different item without asking you. A refund is not instant: it goes back
              through the same payment method where that provider allows it, and the time it takes
              depends on the provider and your bank.
            </p>
          ),
        },
        {
          heading: "If it fails our pre-shipping check",
          body: (
            <p>
              If the item fails the check we can reasonably do, it is not shipped. We tell you, cancel
              the order, and refund what you paid on the same basis as an item we could not secure.
              A passed check is not a refurbishment and does not mean every hidden fault was found.
            </p>
          ),
        },
        {
          heading: "Applicable law",
          body: (
            <p>
              You may have rights under the Consumer Protection Act, 2008, and other applicable law,
              including how those rights apply to second-hand goods. This page is a plain-language
              summary for review, not a legal opinion, and it does not replace the Act. Where this
              page and the law disagree, the law applies.
            </p>
          ),
        },
        {
          heading: "Not as described",
          body: (
            <p>
              That is our mistake and we will make it right. Tell us what the listing said versus what
              arrived and we will offer a repair, replacement or refund. We would rather lose a sale
              than have you find out on delivery.
            </p>
          ),
        },
        {
          heading: "Changed your mind",
          body: (
            <p>
              Contact us with your order number as soon as you can. Whether a cancellation can be
              accepted depends on how far the order has gone. Once an item has been checked, packed and
              handed to the courier, cancellation may no longer be possible. Cosmetic wear described on
              the listing is part of a second-hand item, not a fault. If you are unsure whether
              something suits you,{" "}
              {hasWhatsapp() ? (
                <>
                  <a
                    href={whatsappLink(`Hi ${brand.name}, I have a question about an item.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    message us
                  </a>{" "}
                  before
                </>
              ) : (
                <>ask us before </>
              )}
              you buy it, and we will tell you honestly.
            </p>
          ),
        },
        {
          heading: "How to start a return",
          body: (
            <ol className="list-decimal space-y-2 pl-5">
              <li>{contactBlurb("Message us")}.</li>
              <li>Quote your order number.</li>
              <li>Describe the problem and, if relevant, send a photo.</li>
              <li>We confirm what happens next and who pays the postage.</li>
            </ol>
          ),
        },
        {
          heading: "Where to send returns",
          body:
            address.length > 0 ? (
              <address className="not-italic">
                {legal.contactPerson ? `${legal.contactPerson}\n` : ""}
                {address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
                <span className="block">South Africa</span>
                <span className="mt-2 block text-sm text-ink-500">
                  Quote your order number inside the parcel.
                </span>
              </address>
            ) : (
              <p>
                Our returns address has not been published yet. Contact us and we will send you the
                correct address for your specific return — please do not send anything anywhere until
                we have confirmed it with you.
              </p>
            ),
        },
      ]}
    >
      <p className="mt-8 text-sm text-ink-600">
        See also our{" "}
        <Link href="/terms" className="font-semibold text-brand-700 hover:underline">
          terms and conditions
        </Link>{" "}
        and{" "}
        <Link href="/shipping" className="font-semibold text-brand-700 hover:underline">
          delivery information
        </Link>
        .
      </p>
      <div className="mt-6">
        <PolicyLinks />
      </div>
    </InfoPage>
  );
}
