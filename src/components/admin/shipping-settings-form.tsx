"use client";

import { useActionState } from "react";
import { saveShippingSettingsAction, type AdminFormState } from "@/app/actions/admin";
import { Field } from "@/components/admin/ui";
import { ZA_PROVINCES } from "@/lib/enums";
import { centsToInput } from "@/lib/money";

interface Settings {
  volumetricDivisor: number;
  ratesConfirmed: boolean;
  isActive: boolean;
  lockerEnabled: boolean;
  lockerMaxWeightGrams: number;
  lockerMaxLengthCm: number;
  lockerMaxWidthCm: number;
  lockerMaxHeightCm: number;
  lockerMaxSumCm: number;
  courierEnabled: boolean;
  deliverySurchargeCents: number;
  freeShippingAboveCents: number;
  handlingFeeCents: number;
  dispatchPostalCode: string;
  dispatchProvince: string;
  dispatchCity: string;
  lockerEtaMinDays: number;
  lockerEtaMaxDays: number;
  courierEtaMinDays: number;
  courierEtaMaxDays: number;
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
        Enter confirmed courier tariffs under Price brackets. Deactivate example rates until verified. Shipping is charged separately to the customer.
      </p>
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      ) : null}
      <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" name="ratesConfirmed" defaultChecked={checked("ratesConfirmed", settings.ratesConfirmed)} />These active tariffs, dispatch details, service coverage and parcel limits are confirmed for our Courier Guy account.</label>
      <div className="flex flex-wrap gap-4 text-sm font-semibold text-ink-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={checked("isActive", settings.isActive)} />
          Shipping quotes on
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="lockerEnabled" defaultChecked={checked("lockerEnabled", settings.lockerEnabled)} />
          Locker delivery
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="courierEnabled" defaultChecked={checked("courierEnabled", settings.courierEnabled)} />
          Courier delivery
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Courier volumetric divisor (cm³/kg)" hint="Confirm for the chosen account and service. Courier Guy guidance lists ECO 4000 and OVN 5000."><input className="input" name="volumetricDivisor" type="number" min={1000} max={10000} required defaultValue={text("volumetricDivisor", settings.volumetricDivisor)} /></Field>
        <Field label="Locker max weight (g)" error={err("lockerMaxWeightGrams")}>
          <input className="input" name="lockerMaxWeightGrams" type="number" min={0} defaultValue={text("lockerMaxWeightGrams", settings.lockerMaxWeightGrams)} />
        </Field>
        <Field label="Locker max length (cm)" error={err("lockerMaxLengthCm")}>
          <input className="input" name="lockerMaxLengthCm" type="number" min={0} step="0.1" defaultValue={text("lockerMaxLengthCm", settings.lockerMaxLengthCm)} />
        </Field>
        <Field label="Locker max width (cm)" error={err("lockerMaxWidthCm")}>
          <input className="input" name="lockerMaxWidthCm" type="number" min={0} step="0.1" defaultValue={text("lockerMaxWidthCm", settings.lockerMaxWidthCm)} />
        </Field>
        <Field label="Locker max height (cm)" error={err("lockerMaxHeightCm")}>
          <input className="input" name="lockerMaxHeightCm" type="number" min={0} step="0.1" defaultValue={text("lockerMaxHeightCm", settings.lockerMaxHeightCm)} />
        </Field>
        <Field label="Locker max combined (cm)" hint="Length + width + height." error={err("lockerMaxSumCm")}>
          <input className="input" name="lockerMaxSumCm" type="number" min={0} step="0.1" defaultValue={text("lockerMaxSumCm", settings.lockerMaxSumCm)} />
        </Field>
        <Field label="Delivery surcharge (R)" hint="Added to the selected shipping rate." error={err("deliverySurchargeCents")}>
          <input className="input" name="deliverySurcharge" inputMode="decimal" defaultValue={text("deliverySurcharge", centsToInput(settings.deliverySurchargeCents))} />
        </Field>
        <Field label="Free shipping from (R)" hint="0 turns free shipping off." error={err("freeShippingAboveCents")}>
          <input className="input" name="freeShippingAbove" inputMode="decimal" defaultValue={text("freeShippingAbove", centsToInput(settings.freeShippingAboveCents))} />
        </Field>
        <Field label="Handling fee (R)" hint="Added to the selected shipping rate." error={err("handlingFeeCents")}>
          <input className="input" name="handlingFee" inputMode="decimal" defaultValue={text("handlingFee", centsToInput(settings.handlingFeeCents))} />
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
        <Field label="Locker ETA from (days)" error={err("lockerEtaMinDays")}>
          <input className="input" name="lockerEtaMinDays" type="number" min={0} defaultValue={text("lockerEtaMinDays", settings.lockerEtaMinDays)} />
        </Field>
        <Field label="Locker ETA to (days)" error={err("lockerEtaMaxDays")}>
          <input className="input" name="lockerEtaMaxDays" type="number" min={0} defaultValue={text("lockerEtaMaxDays", settings.lockerEtaMaxDays)} />
        </Field>
        <Field label="Courier ETA from (days)" error={err("courierEtaMinDays")}>
          <input className="input" name="courierEtaMinDays" type="number" min={0} defaultValue={text("courierEtaMinDays", settings.courierEtaMinDays)} />
        </Field>
        <Field label="Courier ETA to (days)" error={err("courierEtaMaxDays")}>
          <input className="input" name="courierEtaMaxDays" type="number" min={0} defaultValue={text("courierEtaMaxDays", settings.courierEtaMaxDays)} />
        </Field>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save shipping rules"}
      </button>
    </form>
  );
}
