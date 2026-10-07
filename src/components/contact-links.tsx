import { cn } from "@/lib/utils";
import { contact, hasEmail, hasPhone, hasWhatsapp, telHref, whatsappLink } from "@/lib/brand";

/**
 * Renders only the contact channels the business has actually configured.
 *
 * Before this existed, every page called `whatsappLink()` directly and shipped a
 * link to a placeholder number that belonged to nobody. Centralising it means an
 * unconfigured channel simply does not appear, and a page cannot forget to check.
 */
export function ContactLinks({
  message,
  className,
  variant = "text",
}: {
  /** Prefilled WhatsApp text. */
  message?: string;
  className?: string;
  variant?: "text" | "stacked";
}) {
  const channels: Array<{ key: string; href: string; label: string; external?: boolean }> = [];

  if (hasWhatsapp()) {
    channels.push({
      key: "whatsapp",
      href: whatsappLink(message),
      label: "WhatsApp us",
      external: true,
    });
  }
  if (hasPhone()) {
    channels.push({ key: "phone", href: telHref(), label: contact.phone });
  }
  if (hasEmail()) {
    channels.push({ key: "email", href: `mailto:${contact.email}`, label: contact.email });
  }

  if (channels.length === 0) return null;

  if (variant === "stacked") {
    return (
      <ul className={cn("space-y-2 text-sm", className)}>
        {channels.map((channel) => (
          <li key={channel.key}>
            <a
              href={channel.href}
              className="font-semibold text-brand-700 hover:underline"
              {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {channel.label}
            </a>
          </li>
        ))}
        {contact.hours ? <li className="text-ink-600">{contact.hours}</li> : null}
      </ul>
    );
  }

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm", className)}>
      {channels.map((channel) => (
        <li key={channel.key}>
          <a
            href={channel.href}
            className="hover:text-ink-800"
            {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {channel.label}
          </a>
        </li>
      ))}
      {contact.hours ? <li className="text-ink-500">{contact.hours}</li> : null}
    </ul>
  );
}
