"use client";

import { useActionState } from "react";
import { saveShippingSettingsAction, type AdminFormState } from "@/app/actions/admin";
import { Field } from "@/components/admin/ui";
import { ZA_PROVINCES } from "@/lib/enums";

interface Settings {
  isActive: boolean;
  ratesConfirmed: boolean;
  doorFuelSurchargePercent: number;
  dispatchPostalCode: string;
  dispatchProvince: string;
  dispatchCity: string;
  etaMinDays: number;
  etaMaxDays: number;
}

const initial: AdminFormState = { ok: false };

export function ShippingSettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveShippingSettingsAction, initial);
  const values = state.values;
  const text = (name: string, fallback: string | number) => values?.[name] ?? String(fallback);
  const checked = (name: string, fallback: boolean) => (values ? values[name] === "on" : fallback);
  const err = (key: string) => state.fieldErrors?.[key]?.[0];

  return (
    <form key={String(state.stamp ?? "base")} action={action} className="card space-y-4 p-5">
      <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">Rules</h2>
      <p className="text-sm text-ink-600">
        Customer-paid landing-parcel delivery from The Courier Guy&apos;s published locker tariff card. The per-size
        prices are edited in the Parcel sizes section below. Shipping is charged separately to the customer.
      </p>
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4 text-sm font-semibold text-ink-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={checked("isActive", settings.isActive)} />
          Shipping quotes on
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ratesConfirmed" defaultChecked={checked("ratesConfirmed", settings.ratesConfirmed)} />
          These tariff-card rates are confirmed for our Courier Guy account
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Door fuel surcharge (%)"
          hint="The Courier Guy's current monthly fuel surcharge for to-door services. 0 keeps to-door delivery closed so no guessed price is ever quoted."
          error={err("doorFuelSurchargePercent")}
        >
          <input className="input" name="doorFuelSurchargePercent" type="number" min={0} max={100} step="0.01" defaultValue={text("doorFuelSurchargePercent", settings.doorFuelSurchargePercent)} />
        </Field>
        <Field label="Dispatch city" error={err("dispatchCity")}>
          <input className="input" name="dispatchCity" required defaultValue={text("dispatchCity", settings.dispatchCity)} />
        </Field>
        <Field label="Dispatch province" error={err("dispatchProvince")}>
          <select className="input" name="dispatchProvince" defaultValue={text("dispatchProvince", settings.dispatchProvince)}>
            {ZA_PROVINCES.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dispatch postal code" error={err("dispatchPostalCode")}>
          <input className="input" name="dispatchPostalCode" required defaultValue={text("dispatchPostalCode", settings.dispatchPostalCode)} />
        </Field>
        <Field label="Estimated delivery from (days)" error={err("etaMinDays")}>
          <input className="input" name="etaMinDays" type="number" min={0} defaultValue={text("etaMinDays", settings.etaMinDays)} />
        </Field>
        <Field label="Estimated delivery to (days)" error={err("etaMaxDays")}>
          <input className="input" name="etaMaxDays" type="number" min={0} defaultValue={text("etaMaxDays", settings.etaMaxDays)} />
        </Field>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save shipping rules"}
      </button>
    </form>
  );
}
