import type { Metadata } from "next";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { brand, contactBlurb } from "@/lib/brand";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${brand.name} collects when you order, why we collect it, and what we never do with it.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      breadcrumbs={[{ label: "Privacy" }]}
      requiresLegalReview
      intro="We are a small online shop, not a data-harvesting operation. This page says exactly what we collect and what we do with it."
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Your details when you order:</strong> name, email address, mobile number and
                delivery address.
              </li>
              <li>
                <strong>What you bought:</strong> the items, the price you paid and the delivery
                method, kept against your order.
              </li>
              <li>
                <strong>Technical data:</strong> standard server logs such as IP address and
                user-agent, kept for security and to investigate abuse.
              </li>
            </ul>
          ),
        },
        {
          heading: "What we do not collect",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>No advertising or tracking cookies.</li>
              <li>No third-party trackers, pixels or ad networks.</li>
              <li>No ID documents, no credit checks, no income verification.</li>
              <li>
                No account system, which means no password of yours ever exists in our database.
              </li>
            </ul>
          ),
        },
        {
          heading: "Why we collect it",
          body: (
            <p>
              To do one job: get your order to you and tell you what is happening with it. That means
              packing the right item, posting it to the right address, and contacting you if something
              goes wrong. There is no other purpose, because there is no advertising side to this
              business.
            </p>
          ),
        },
        {
          heading: "Who else sees it",
          body: (
            <p>
              Only the people and companies who have to in order for you to receive the order:
              the courier who delivers your parcel gets the name, address and phone number on the
              label, and the payment arrangement gets whatever it needs. We do not sell or rent your
              details to anyone, ever.
            </p>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <p>
              Order records are kept for as long as we need them for accounting and to handle a
              warranty claim. We do not keep marketing data, because we do not collect any.
            </p>
          ),
        },
        {
          heading: "Your rights",
          body: (
            <p>
              You can ask us what we hold about you, ask us to correct it, or ask us to delete it.{" "}
              {contactBlurb("Get in touch")} and we will deal with it. We will also need to keep any
              records we are legally required to keep, such as invoices.
            </p>
          ),
        },
        {
          heading: "Security",
          body: (
            <p>
              Order pages are only shown to the device that placed the order, so someone who guesses an
              order number cannot read your address. Passwords are never stored in plain text. The site
              is served over HTTPS in production.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              {legal.companyName ? `${legal.companyName}. ` : ""}
              {contactBlurb("Questions about privacy? Contact us")}.
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
