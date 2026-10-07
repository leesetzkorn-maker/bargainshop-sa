"use client";

import { useActionState } from "react";
import { savePricingSettingsAction, type AdminFormState } from "@/app/actions/admin";
import { Field } from "@/components/admin/ui";
import { centsToInput } from "@/lib/money";
import type { PricingSettings } from "@/lib/pricing";

const initial: AdminFormState = { ok: false };

function randInput(cents: number | null): string {
  if (cents == null) return "";
  return String(cents / 100);
}

export function PricingForm({ settings }: { settings: PricingSettings }) {
  const [state, action, pending] = useActionState(savePricingSettingsAction, initial);
  const checked = (name: string, fallback: boolean) =>
    state.values ? state.values[name] === "on" : fallback;

  return (
    <form action={action} className="card space-y-4 p-5">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
        <input type="checkbox" name="isActive" defaultChecked={checked("isActive", settings.isActive)} />
        Use these tiers when calculating a draft selling price
      </label>
      <p className="text-sm text-ink-600">
        Each band sets a profit target as a percentage of source cost. Allowances and estimated payment fees are covered first. This is markup, not gross margin. Customers never
        see the cost or the percent. Shipping stays a separate charge.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ["handlingAllowance", "Handling / sourcing allowance (R)", settings.handlingAllowanceCents],
          ["packagingAllowance", "Packaging allowance (R)", settings.packagingAllowanceCents],
          ["minimumProfit", "Minimum profit after allowances (R)", settings.minimumProfitCents],
          ["paymentFeeFixed", "Payment fee fixed amount (R)", settings.paymentFeeFixedCents],
        ] as const).map(([name, label, cents]) => <Field key={name} label={label}><input className="input" name={name} inputMode="decimal" required defaultValue={centsToInput(cents ?? 0)} /></Field>)}
        <Field label="Estimated payment fee %"><input className="input" name="paymentFeePercent" type="number" min={0} max={30} step="0.01" required defaultValue={settings.paymentFeePercent ?? 0} /></Field>
        <Field label="Minimum estimated margin %" hint="After source cost, allowances and estimated payment fees. Minimum Rand profit and band target also apply."><input className="input" name="targetMarginPercent" type="number" min={0} max={60} step="0.1" required defaultValue={settings.targetMarginPercent ?? 0} /></Field>
        <Field label="Rounding rule"><select className="input" name="roundingMode" defaultValue={settings.roundingMode ?? "UP"}><option value="UP">Round up</option><option value="NEAREST">Nearest (preserves minimum profit)</option></select></Field>
      </div>
      <div className="space-y-3">
        {settings.tiers.map((tier, index) => (
          <div key={`${tier.minCostCents}-${index}`} className="grid gap-3 sm:grid-cols-3">
            <Field label="From (R)">
              <input className="input" name="tierMin" inputMode="decimal" defaultValue={randInput(tier.minCostCents)} required />
            </Field>
            <Field label="Below (R)" hint="Leave blank for the top band.">
              <input className="input" name="tierBelow" inputMode="decimal" defaultValue={randInput(tier.belowCostCents)} />
            </Field>
            <Field label="Markup %">
              <input className="input" name="tierPercent" type="number" min={0} max={500} defaultValue={tier.markupPercent} required />
            </Field>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Round selling price to (cents)" hint="1000 is the nearest R10. 100 is the nearest rand. 0 leaves the exact amount.">
          <input
            className="input"
            name="roundingIncrementCents"
            type="number"
            min={0}
            defaultValue={settings.roundingIncrementCents}
          />
        </Field>
        <Field label="Minimum selling price (R)" hint="0 means no floor.">
          <input className="input" name="minPrice" inputMode="decimal" defaultValue={centsToInput(settings.minPriceCents)} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input type="checkbox" name="applyToDrafts" className="mt-1" />
        <span>
          Recalculate unpublished drafts that already have a confirmed acquisition cost. Live products
          stay as they are. Drafts with no cost are skipped.
        </span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save pricing rules"}
      </button>
    </form>
  );
}
