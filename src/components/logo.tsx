import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Square mark: a bargain-ticket "2" with a gold price bar. Original to 2DE. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#123F36" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fill="#F6F1E8"
        fontFamily="Arial Black, Arial, sans-serif"
        fontSize="36"
        fontWeight="900"
      >
        2
      </text>
      <rect x="16" y="48" width="32" height="5" rx="2.5" fill="#E6A317" />
    </svg>
  );
}

/**
 * Header / footer lockup. The wordmark follows the trading name so a rename
 * in the environment still matches the mark. The hyphen stays gold — that is
 * the bargain accent in the 2DE identity.
 */
export function Logo({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "inverse";
}) {
  const spaced = brand.name.match(/^(2DE)\s+(.+)$/i);
  const parts = spaced ? [spaced[1], spaced[2]] : brand.name.split("-");
  const lead = parts[0] ?? brand.name;
  const rest = parts.slice(1).join(spaced ? " " : "-");
  const gap = spaced ? " " : "";

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span
        className={cn(
          "truncate font-display text-[15px] font-extrabold leading-none tracking-tight sm:text-lg",
          tone === "inverse" ? "text-white" : "text-ink-900",
        )}
      >
        {lead}
        {rest ? (
          <>
            <span className="text-accent-500">{gap || "-"}</span>
            {rest}
          </>
        ) : null}
      </span>
    </span>
  );
}
