import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui";
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
} from "@/lib/enums";

const LABELS: Record<string, string> = {
  ...PRODUCT_STATUS_LABELS,
  ...ORDER_STATUS_LABELS,
  ...PAYMENT_STATUS_LABELS,
  ...FULFILLMENT_STATUS_LABELS,
  ...SHIPMENT_STATUS_LABELS,
};

/**
 * Colour per status.
 *
 * Kept as one flat map because order, payment, fulfilment and product statuses
 * share a namespace in the UI. Green means money in and item gone; amber means
 * the customer is waiting on us; red means dead; grey means not public.
 */
const TONE: Record<string, string> = {
  // Healthy
  ACTIVE: "badge-success",
  PAID: "badge-success",
  DELIVERED: "badge-success",
  SENT: "badge-success",
  // Moving
  PROCESSING: "badge-brand",
  PACKED: "badge-brand",
  DISPATCHED: "badge-brand",
  IN_TRANSIT: "badge-brand",
  ITEM_SECURED: "badge-brand",
  // Waiting on us or the customer
  PENDING: "badge-accent",
  PENDING_PAYMENT: "badge-accent",
  UNPAID: "badge-accent",
  UNPAID_PARTIAL: "badge-accent",
  CHECKING_STOCK: "badge-accent",
  PREPARING_SHIPMENT: "badge-accent",
  READY_FOR_PICKUP: "badge-accent",
  AWAITING_PAYMENT: "badge-accent",
  // Dead or gone
  SOLD_OUT: "badge-danger",
  CANCELLED: "badge-danger",
  REFUNDED: "badge-danger",
  RETURNED: "badge-danger",
  FAILED: "badge-danger",
  UNAVAILABLE: "badge-danger",
  // Not public
  DRAFT: "badge-neutral",
  ARCHIVED: "badge-neutral",
  RESERVED: "badge-neutral",
  SKIPPED_NOT_CONFIGURED: "badge-neutral",
  QUEUED: "badge-neutral",
};

export function StatusPill({ value }: { value: string }) {
  return <span className={cn("badge", TONE[value] ?? "badge-neutral")}>{LABELS[value] ?? value}</span>;
}

export function Notice({ error, saved }: { error?: string; saved?: boolean }) {
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (saved) return <Alert tone="success">Saved.</Alert>;
  return null;
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="heading-section text-2xl text-ink-900 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-600">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
