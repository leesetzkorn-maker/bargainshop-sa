import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { brand, contactBlurb } from "@/lib/brand";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & conditions",
  description: `The rules for ordering from ${brand.name}: pricing, stock, payment, delivery and your statutory rights.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms & conditions"
      breadcrumbs={[{ label: "Terms" }]}
      requiresLegalReview
      intro="Plain terms, written to be read. Where they conflict with South African consumer law, the law wins."
      sections={[
        {
          heading: "Who you are dealing with",
          body: (
            <p>
              {legal.companyName
                ? `${legal.companyName}`
                : `This website is operated by ${brand.name}`}
              {legal.registrationNumber
                ? `, registration number ${legal.registrationNumber}`
                : ""}
              {legal.vatNumber ? `, VAT number ${legal.vatNumber}` : ""}. {contactBlurb("Contact us")}.
            </p>
          ),
        },
        {
          heading: "All stock is second-hand",
          body: (
            <>
              <p>
                Every item sold on this site is second-hand and graded{" "}
                <strong>Excellent</strong>, <strong>Good</strong> or <strong>Fair</strong>. The grade
                on the product page describes the item you will receive. We do not sell new goods and
                we do not pass off refurbished stock as new.
              </p>
              <p>
                Cosmetic marks described in the listing are part of the item, not a fault. Faults are
                covered — see{" "}
                <Link href="/returns" className="font-semibold text-brand-700 hover:underline">
                  returns and faults
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          heading: "Prices and stock",
          body: (
            <>
              <p>
                All prices are in South African Rand and include VAT where applicable. Delivery is
                quoted separately at checkout and never added after you have ordered.
              </p>
              <p>
                Because most stock is one-off, an item can sell out while you are checking out. If
                that happens we tell you and nothing is charged. We only sell stock we actually have.
              </p>
              <p>
                We may correct a price that was listed in error before you order, and we will tell you
                rather than quietly charging the new amount.
              </p>
            </>
          ),
        },
        {
          heading: "Payment",
          body: (
            <p>
              No online payment gateway is connected to this store yet, so payment is arranged with
              you directly after you order. Placing an order reserves the item; it does not complete
              payment. We will contact you on the number you supplied to arrange it.
            </p>
          ),
        },
        {
          heading: "Delivery",
          body: (
            <p>
              All products are shipped with The Courier Guy. Expected delivery is approximately
              1–3 working days depending on destination and service after dispatch. Processing can add time. This is an estimate, not a
              guaranteed delivery date. Risk in transit passes to you on delivery to the address
              you gave us — so please make sure that address is correct, because a parcel sent to the
              wrong address cannot be recovered.
            </p>
          ),
        },
        {
          heading: "Your statutory rights",
          body: (
            <p>
              Nothing on this page limits your rights under the Consumer Protection Act or any other
              law. You are always entitled to the six-month warranty against defects described on our{" "}
              <Link href="/returns" className="font-semibold text-brand-700 hover:underline">
                returns page
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "This website",
          body: (
            <p>
              We try hard to keep the site accurate, but we do not warrant that every description,
              photograph or price is perfect. Nothing on this site may be reproduced commercially
              without permission.
            </p>
          ),
        },
        {
          heading: "Changes",
          body: (
            <p>
              These terms may change as the business grows or the law does. The version on this page
              is the version that applies to your order.
            </p>
          ),
        },
      ]}
    >
      <div className="mt-6">
        <PolicyLinks />
      </div>
    </InfoPage>
  );
}
