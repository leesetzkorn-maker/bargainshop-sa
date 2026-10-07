import {
  TESTING_STATUS_BADGE,
  TESTING_STATUS_EXPLANATION,
  normaliseTestingStatus,
} from "@/lib/enums";

/**
 * "Tested before shipping" — said precisely.
 *
 * The whole risk with this badge is the second-hand reading of the word
 * "tested": customers reasonably hear "refurbished" or "as good as new". We have
 * not done that work, so this component always pairs the claim with the
 * sentence that rules it out. The explanation is not optional and has no short
 * variant, because a bare "Tested" badge is the misleading version.
 */
export function TestingBadge({
  status,
  className = "",
  showExplanation = true,
}: {
  status: string;
  className?: string;
  showExplanation?: boolean;
}) {
  const key = normaliseTestingStatus(status);
  const tested = key === "TESTED_AND_WORKING";

  return (
    <div className={className}>
      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          tested
            ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300"
            : "bg-stone-200 text-stone-700 ring-1 ring-stone-300",
        ].join(" ")}
      >
        {tested ? (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.97 2.97 6.97-6.97a.75.75 0 0 1 1.06-.006Z"
              clipRule="evenodd"
            />
          </svg>
        ) : null}
        {TESTING_STATUS_BADGE[key]}
      </span>
      {showExplanation ? (
        <p className="mt-2 text-sm text-ink-600">{TESTING_STATUS_EXPLANATION[key]}</p>
      ) : null}
    </div>
  );
}
