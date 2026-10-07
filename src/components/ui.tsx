import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatZAR } from "@/lib/money";
import {
  conditionDescription,
  conditionLabel,
  normaliseCondition,
} from "@/lib/enums";

/** Condition pill. Green is the cleanest grade. As-is stays neutral. */
export function ConditionBadge({ condition }: { condition: string }) {
  const key = normaliseCondition(condition);
  const tone =
    key === "VERY_GOOD"
      ? "badge-success"
      : key === "GOOD"
        ? "badge-brand"
        : key === "USED"
          ? "badge-accent"
          : "badge-neutral";
  return (
    <span className={cn("badge", tone)} title={conditionDescription(condition)}>
      {conditionLabel(condition)}
    </span>
  );
}

export function Price({
  cents,
  size = "md",
  className,
}: {
  cents: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
    xl: "text-3xl",
  } as const;

  return (
    <span className={cn("font-bold tracking-tight text-ink-900 tabular-nums", sizes[size], className)}>
      {formatZAR(cents)}
    </span>
  );
}

/** Stock pill. Distinguishes one-off, low stock and sold out. */
export function StockBadge({ stockQty, status }: { stockQty: number; status: string }) {
  if (status === "SOLD_OUT" || stockQty <= 0) {
    return <span className="badge badge-danger">Sold out</span>;
  }
  if (stockQty === 1) {
    return <span className="badge badge-accent">Only 1 available</span>;
  }
  if (stockQty <= 3) {
    return <span className="badge badge-accent">Only {stockQty} left</span>;
  }
  return <span className="badge badge-success">In stock</span>;
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    success: "border-green-200 bg-green-50 text-green-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  } as const;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={cn(title && "mt-1")}>{children}</div>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true" className="text-ink-300">/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-ink-800 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-ink-700" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-700">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="heading-section text-2xl text-ink-900 sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 text-ink-600 sm:text-base">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-ink-400" stroke="currentColor" strokeWidth="1.75">
          <path d="M3 7h18M3 12h18M3 17h10" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="heading-section text-lg text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-600">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
