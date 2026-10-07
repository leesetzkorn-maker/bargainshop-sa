import { ORDER_STATUSES_CLOSED, ORDER_STATUS_LABELS, ORDER_WORKFLOW, type OrderStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

/**
 * The sourcing pipeline as a progress bar.
 *
 * This is the screen the shop actually works from, so it shows the real steps
 * the business goes through: money in, find the item, hold the item, pack it.
 * Fulfilled steps are ticked from the status, not from a separate flag, so the
 * bar can never disagree with the order record.
 */
export function WorkflowStepper({ status }: { status: string }) {
  const closed = (ORDER_STATUSES_CLOSED as string[]).includes(status);
  const currentIndex = ORDER_WORKFLOW.indexOf(status as OrderStatus);
  // A closed order has no position in the pipeline. Show the bar greyed out
  // rather than pretending the order is somewhere along it.
  const reached = currentIndex >= 0 ? currentIndex : -1;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-ink-900">Sourcing progress</h2>
        {closed ? (
          <span className="text-sm font-semibold text-danger-700">
            Order closed — {ORDER_STATUS_LABELS[status as OrderStatus] ?? status}
          </span>
        ) : null}
      </div>

      <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
        {ORDER_WORKFLOW.map((step, index) => {
          const done = reached >= 0 && index < reached;
          const current = reached === index;
          return (
            <li key={step} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                    done && "border-brand-600 bg-brand-600 text-white",
                    current && "border-brand-600 bg-white text-brand-700",
                    !done && !current && "border-ink-300 bg-white text-ink-400",
                    closed && "border-ink-200 bg-ink-50 text-ink-300",
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    current ? "text-ink-900" : "text-ink-600",
                    closed && "text-ink-400",
                  )}
                >
                  {ORDER_STATUS_LABELS[step]}
                </span>
              </div>
              {index < ORDER_WORKFLOW.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-0.5 flex-1 rounded sm:block",
                    done && !closed ? "bg-brand-600" : "bg-ink-200",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
