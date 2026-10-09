import { formatZAR } from "@/lib/money";
import { getAdminShippingSettings, listAdminShippingTiers } from "@/lib/dal/admin";
import { deleteShippingTierAction, saveShippingTierAction } from "@/app/actions/admin";
import { one } from "@/components/admin/format";
import { Field, Notice, PageHeader } from "@/components/admin/ui";
import { ShippingSettingsForm } from "@/components/admin/shipping-settings-form";

function TierFields({
  tier,
}: {
  tier?: {
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    maxLengthCm: number;
    maxWidthCm: number;
    maxHeightCm: number;
    maxWeightGrams: number;
    lockerToLockerCents: number;
    lockerToDoorCents: number;
    lockerToKioskCents: number;
    kioskToDoorCents: number;
    notes: string | null;
  };
}) {
  const money = (cents?: number) => (cents == null ? "" : (cents / 100).toFixed(2));
  return (
    <>
      {tier ? <input type="hidden" name="id" value={tier.id} /> : null}
      <Field label="Code" hint="XS, S, M, L or XL">
        <input className="input" name="code" required maxLength={6} defaultValue={tier?.code ?? ""} placeholder="M" />
      </Field>
      <Field label="Name">
        <input className="input" name="name" required defaultValue={tier?.name ?? ""} placeholder="Medium" />
      </Field>
      <Field label="Sort">
        <input className="input" name="sortOrder" type="number" min={0} defaultValue={tier?.sortOrder ?? 0} />
      </Field>
      <Field label="Max length (cm)">
        <input className="input" name="maxLengthCm" type="number" min={0} step="0.1" required defaultValue={tier?.maxLengthCm ?? ""} />
      </Field>
      <Field label="Max width (cm)">
        <input className="input" name="maxWidthCm" type="number" min={0} step="0.1" required defaultValue={tier?.maxWidthCm ?? ""} />
      </Field>
      <Field label="Max height (cm)">
        <input className="input" name="maxHeightCm" type="number" min={0} step="0.1" required defaultValue={tier?.maxHeightCm ?? ""} />
      </Field>
      <Field label="Max weight (g)">
        <input className="input" name="maxWeightGrams" type="number" min={1} required defaultValue={tier?.maxWeightGrams ?? ""} />
      </Field>
      <Field label="Locker → locker (R)">
        <input className="input" name="lockerToLocker" inputMode="decimal" required defaultValue={money(tier?.lockerToLockerCents)} />
      </Field>
      <Field label="Locker → door (R)" hint="Excludes fuel surcharge">
        <input className="input" name="lockerToDoor" inputMode="decimal" required defaultValue={money(tier?.lockerToDoorCents)} />
      </Field>
      <Field label="Locker → kiosk (R)">
        <input className="input" name="lockerToKiosk" inputMode="decimal" required defaultValue={money(tier?.lockerToKioskCents)} />
      </Field>
      <Field label="Kiosk → door (R)" hint="Excludes fuel surcharge">
        <input className="input" name="kioskToDoor" inputMode="decimal" required defaultValue={money(tier?.kioskToDoorCents)} />
      </Field>
      <Field label="Notes" hint="Optional">
        <input className="input" name="notes" maxLength={500} defaultValue={tier?.notes ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
        <input type="checkbox" name="isActive" defaultChecked={tier?.isActive ?? true} />
        Active
      </label>
    </>
  );
}

export default async function AdminShippingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const [settings, tiers] = await Promise.all([getAdminShippingSettings(), listAdminShippingTiers()]);

  return (
    <>
      <PageHeader
        title="Shipping"
        description="The Courier Guy locker tariff card. Customers pay delivery separately."
      />
      <div className="mb-4">
        <Notice error={one(query.error)} saved={one(query.saved) === "1"} />
      </div>
      {process.env.SHIPPING_RATE_CARD === "tcg-locker-2026-09" ? <div className="card mb-4 p-4"><p className="font-semibold">Active: owner-confirmed Courier Guy locker card, 1 September 2026.</p><p className="mt-2 text-sm">XS R59, S R69, M R79, L R109, XL R149, selected by packed dimensions and weight. The legacy settings and weight brackets below do not change these prices. Door delivery requires TCG_DOOR_FUEL_SURCHARGE_PERCENT and TCG_DOOR_FUEL_SURCHARGE_MONTH for the current month. No free-shipping discount applies.</p></div> : null}
      <ShippingSettingsForm settings={settings} />

      <section className="mt-6 space-y-3">
        <h2 className="heading-section text-xl text-ink-900">Parcel sizes &amp; prices</h2>
        <p className="text-sm text-ink-600">
          The whole cart is priced as one parcel. It matches the smallest active size whose box and weight limit it
          fits inside, then the price for the chosen service is read from that size. All prices include VAT; the
          to-door prices exclude the monthly fuel surcharge, which is added at checkout once the percentage above is
          set.
        </p>
        {tiers.map((tier) => (
          <div key={tier.id}>
            <form action={saveShippingTierAction} className="card grid gap-3 p-4 sm:grid-cols-3">
              <TierFields tier={tier} />
              <div className="flex items-end gap-2 sm:col-span-3">
                <button type="submit" className="btn btn-secondary btn-sm">
                  Save {tier.code}
                </button>
                <span className="text-xs text-ink-500">
                  {tier.lockerToLockerCents > 0 ? `Locker → locker ${formatZAR(tier.lockerToLockerCents)}` : "No price"}
                </span>
              </div>
            </form>
            <form action={deleteShippingTierAction} className="mt-1 text-right">
              <input type="hidden" name="id" value={tier.id} />
              <button type="submit" className="btn btn-ghost btn-sm text-danger-600">
                Delete {tier.code}
              </button>
            </form>
          </div>
        ))}

        <form action={saveShippingTierAction} className="card grid gap-3 p-4 sm:grid-cols-3">
          <h3 className="font-bold text-ink-900 sm:col-span-3">New size</h3>
          <TierFields />
          <div className="sm:col-span-3">
            <button type="submit" className="btn btn-primary">
              Add size
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
