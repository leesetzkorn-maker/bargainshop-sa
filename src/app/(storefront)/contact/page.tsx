import type { Metadata } from "next";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import {
  brand,
  contact,
  hasAnyContact,
  hasEmail,
  hasPhone,
  hasWhatsapp,
  telHref,
  whatsappLink,
} from "@/lib/brand";
import { legalAddressLines } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact us",
  description: `Get in touch with ${brand.name} about an order, a product or the site.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const address = legalAddressLines();
  const whatsapp = hasWhatsapp();

  return (
    <InfoPage
      title="Contact us"
      breadcrumbs={[{ label: "Contact" }]}
      intro={
        whatsapp
          ? "Questions about an item, an order or the store? The fastest way to reach us is WhatsApp during business hours."
          : "Questions about an item, an order or the store? Here is every way to reach us."
      }
      sections={[
        // Only offer a channel the business has actually set up. An empty
        // heading with no link is worse than no heading at all.
        ...(whatsapp
          ? [
              {
                heading: "WhatsApp",
                body: (
                  <p>
                    <a
                      href={whatsappLink(`Hi ${brand.name}, I have a question.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      Message us on WhatsApp
                    </a>
                  </p>
                ),
              },
            ]
          : []),
        ...(hasEmail()
          ? [
              {
                heading: "Email",
                body: (
                  <p>
                    <a href={`mailto:${contact.email}`} className="font-semibold text-brand-700 hover:underline">
                      {contact.email}
                    </a>
                    <br />
                    <span className="text-sm text-ink-500">
                      We reply to order enquiries within one working day.
                    </span>
                  </p>
                ),
              },
            ]
          : []),
        ...(hasPhone()
          ? [
              {
                heading: "Phone",
                body: (
                  <p>
                    <a href={telHref()} className="font-semibold text-brand-700 hover:underline">
                      {contact.phone}
                    </a>
                    {contact.hours ? (
                      <>
                        <br />
                        <span className="text-sm text-ink-500">{contact.hours}</span>
                      </>
                    ) : null}
                  </p>
                ),
              },
            ]
          : []),
        ...(hasAnyContact()
          ? []
          : [
              {
                heading: "Contact details being set up",
                body: (
                  <p>
                    We have not published direct contact details yet. If you have an order in progress we
                    will always reach you through the email address you gave us at checkout — or open the
                    order page and use the contact button there.
                  </p>
                ),
              },
            ]),
        {
          heading: "Already ordered?",
          body: (
            <p>
              Please quote your <strong>order number</strong> — it looks like{" "}
              <span className="font-mono">2DS-2026-0001</span> and is on your confirmation page. It lets
              us find your order immediately instead of searching for it.
            </p>
          ),
        },
        {
          heading: "Where we are",
          body: address.length > 0 ? (
            <address className="not-italic">
              {address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block">South Africa</span>
            </address>
          ) : (
            <p>
              Our physical address has not been published yet. Please contact us and we will give you the
              details you need.
            </p>
          ),
        },
      ]}
    >
      <PolicyLinks />
    </InfoPage>
  );
}
