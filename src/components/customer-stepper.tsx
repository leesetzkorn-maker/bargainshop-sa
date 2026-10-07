import { ORDER_STATUSES_CLOSED, ORDER_STATUS_LABELS, ORDER_WORKFLOW } from "@/lib/enums";

/**
 * Customer-facing version of the sourcing pipeline.
 *
 * This is the promise the whole business model rests on: you pay, we go and buy
 * the exact item, we tell you at each step. The admin has its own stepper with
 * the internal wording; this one is deliberately plainer and never mentions
 * margins or supplier problems.
 */
export function CustomerStepper({ status }: { status: string }) {
  const closed = ORDER_STATUSES_CLOSED.includes(status as never);
  const currentIndex = ORDER_WORKFLOW.indexOf(status as never);
  const reached = currentIndex >= 0 ? currentIndex : -1;

  if (closed) {
    return (
      <ol className="space-y-2">
        <li className="flex items-center gap-3 text-sm font-semibold text-ink-500">
          <span aria-hidden className="size-2.5 rounded-full bg-ink-300" />
          {status === "REFUNDED" ? "Order refunded" : "Order cancelled"}
        </li>
      </ol>
    );
  }

  return (
    <ol className="space-y-0">
      {ORDER_WORKFLOW.map((step, index) => {
        const done = reached >= 0 && index < reached;
        const current = reached === index;
        const last = index === ORDER_WORKFLOW.length - 1;
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  done
                    ? "border-brand-600 bg-brand-600 text-white"
                    : current
                      ? "border-brand-600 bg-white text-brand-700"
                      : "border-ink-300 bg-white text-ink-400"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              {!last ? (
                <span
                  aria-hidden
                  className={`w-0.5 flex-1 ${done ? "bg-brand-600" : "bg-ink-200"}`}
                />
              ) : null}
            </div>
            <span
              className={`pb-4 text-sm ${current ? "font-bold text-ink-900" : done ? "font-semibold text-ink-700" : "text-ink-500"}`}
            >
              {ORDER_STATUS_LABELS[step]}
              {current ? <span className="ml-2 text-xs font-medium text-brand-700">← you are here</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
