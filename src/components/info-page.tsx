import Link from "next/link";
import { Alert, Breadcrumbs } from "@/components/ui";
import { isLegalConfirmed } from "@/lib/legal";

export interface InfoSection {
  heading: string;
  body: React.ReactNode;
}

/**
 * Shared shell for the informational and policy pages.
 *
 * `requiresLegalReview` adds a visible notice, because a policy page that reads
 * confidently while the company details are still placeholders is worse than
 * no policy page at all.
 */
export function InfoPage({
  title,
  intro,
  breadcrumbs,
  sections,
  requiresLegalReview = false,
  children,
}: {
  title: string;
  intro?: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  sections: InfoSection[];
  requiresLegalReview?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, ...breadcrumbs]} />

      <h1 className="heading-section mt-6 text-2xl text-ink-900 sm:text-3xl">{title}</h1>
      {intro ? <p className="mt-3 text-ink-600">{intro}</p> : null}

      {requiresLegalReview && !isLegalConfirmed() ? (
        <Alert tone="warning" title="This page still contains placeholders" className="mt-6">
          The company name, registration number, address and policy wording below have not been
          confirmed by the business yet. They must be completed and reviewed before the store is
          published.
        </Alert>
      ) : null}

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="heading-section text-lg text-ink-900">{section.heading}</h2>
            <div className="mt-2.5 space-y-3 text-sm leading-relaxed text-ink-600">{section.body}</div>
          </section>
        ))}

        {children}
      </div>
    </div>
  );
}

export function InfoLinkList({
  links,
}: {
  links: Array<{ label: string; href: string; description: string }>;
}) {
  return (
    <section className="card p-5">
      <h2 className="heading-section text-base text-ink-900">More information</h2>
      <ul className="mt-3 divide-y divide-ink-100">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="group flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-ink-900 group-hover:underline">
                  {link.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">{link.description}</span>
              </span>
              <span aria-hidden="true" className="mt-1 shrink-0 text-ink-300">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PolicyLinks() {
  return (
    <InfoLinkList
      links={[
        { label: "How buying works", href: "/how-it-works", description: "From browsing to delivery" },
        { label: "Delivery & shipping", href: "/shipping", description: "Prices, lockers and timing" },
        { label: "Returns & faults", href: "/returns", description: "What to do if something is wrong" },
        { label: "Privacy", href: "/privacy", description: "What we collect and why" },
        { label: "Terms & conditions", href: "/terms", description: "The rules of using this store" },
      ]}
    />
  );
}
