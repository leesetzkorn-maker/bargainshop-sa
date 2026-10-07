import { formatZAR } from "@/lib/money";
import { SHIPPING_METHODS, SHIPPING_METHOD_LABELS } from "@/lib/enums";
import { getAdminShippingSettings, listAdminShippingRules } from "@/lib/dal/admin";
import { deleteShippingRuleAction, saveShippingRuleAction } from "@/app/actions/admin";
import { one } from "@/components/admin/format";
import { Field, Notice, PageHeader } from "@/components/admin/ui";
import { ShippingSettingsForm } from "@/components/admin/shipping-settings-form";

export default async function AdminShippingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const [settings, rules] = await Promise.all([getAdminShippingSettings(), listAdminShippingRules()]);

  return (
    <>
      <PageHeader
        title="Shipping"
        description="Configure confirmed temporary The Courier Guy rates. Customers pay delivery separately."
      />
      <div className="mb-4">
        <Notice error={one(query.error)} saved={one(query.saved) === "1"} />
      </div>
      <ShippingSettingsForm settings={settings} />

      <section className="mt-6 space-y-3">
        <h2 className="heading-section text-xl text-ink-900">Price brackets</h2>
        <p className="text-sm text-ink-600">
          A parcel uses the first active bracket for its method whose weight range contains the parcel. Both delivery methods use the saved bracket price. A maximum weight of 0 means
          no upper limit.
        </p>
        {rules.map((rule) => (
          <div key={rule.id}>
          <form action={saveShippingRuleAction} className="card grid gap-3 p-4 sm:grid-cols-3">
            <input type="hidden" name="id" value={rule.id} />
            <Field label="Name">
              <input className="input" name="name" required defaultValue={rule.name} />
            </Field>
            <Field label="Method">
              <select className="input" name="method" defaultValue={rule.method}>
                {SHIPPING_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {SHIPPING_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Confirmed price (R)">
              <input className="input" name="price" inputMode="decimal" required defaultValue={(rule.priceCents / 100).toFixed(2)} />
            </Field>
            <Field label="Destination province codes" hint="Blank = all provinces. Example: GP,WC"><input name="provinceCodes" className="input" defaultValue={rule.provinceCodes} /></Field>
            <Field label="Destination postcode prefixes" hint="Blank = all postcodes. Example: 20,21"><input name="postalCodePrefixes" className="input" defaultValue={rule.postalCodePrefixes} /></Field>
            <Field label="Destination province codes" hint="Blank = all provinces"><input name="provinceCodes" className="input" /></Field>
          <Field label="Destination postcode prefixes" hint="Blank = all postcodes"><input name="postalCodePrefixes" className="input" /></Field>
          <Field label="Min weight (g)">
              <input className="input" name="minWeightGrams" type="number" min={0} defaultValue={rule.minWeightGrams} />
            </Field>
            <Field label="Max weight (g)">
              <input className="input" name="maxWeightGrams" type="number" min={0} defaultValue={rule.maxWeightGrams} />
            </Field>
            <Field label="Sort">
              <input className="input" name="sortOrder" type="number" min={0} defaultValue={rule.sortOrder} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
              <input type="checkbox" name="isActive" defaultChecked={rule.isActive} />
              Active · {formatZAR(rule.priceCents)}
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button type="submit" className="btn btn-secondary btn-sm">
                Save bracket
              </button>
            </div>
          </form>
          <form action={deleteShippingRuleAction} className="mt-1 text-right">
            <input type="hidden" name="id" value={rule.id} />
            <button type="submit" className="btn btn-ghost btn-sm text-danger-600">
              Delete {rule.name}
            </button>
          </form>
          </div>
        ))}

        <form action={saveShippingRuleAction} className="card grid gap-3 p-4 sm:grid-cols-3">
          <h3 className="font-bold text-ink-900 sm:col-span-3">New bracket</h3>
          <Field label="Name">
            <input className="input" name="name" required placeholder="Courier 0–5 kg" />
          </Field>
          <Field label="Method">
            <select className="input" name="method" defaultValue="COURIER">
              {SHIPPING_METHODS.map((method) => (
                <option key={method} value={method}>
                  {SHIPPING_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Confirmed price (R)">
            <input className="input" name="price" inputMode="decimal" required />
          </Field>
          <Field label="Min weight (g)">
            <input className="input" name="minWeightGrams" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Max weight (g)">
            <input className="input" name="maxWeightGrams" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Sort">
            <input className="input" name="sortOrder" type="number" min={0} defaultValue={0} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
            <input type="checkbox" name="isActive" defaultChecked />
            Active
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary">
              Add bracket
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
