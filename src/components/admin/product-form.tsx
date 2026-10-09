"use client";

import { pricingBreakdown, type PricingSettings } from "@/lib/pricing";
import { useActionState, useState } from "react";
import { saveProductAction, type AdminFormState } from "@/app/actions/admin";
import { Field } from "@/components/admin/ui";
import {
  MEASUREMENT_SOURCES,
  MEASUREMENT_SOURCE_BADGE,
  MEASUREMENT_SOURCE_EXPLANATION,
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABELS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  TESTING_STATUSES,
  TESTING_STATUS_EXPLANATION,
  TESTING_STATUS_LABELS,
  normaliseMeasurementSource,
} from "@/lib/enums";
import { centsToInput, formatZAR, parseZARToCents } from "@/lib/money";

export interface ProductFormValues {
  specifications?: string;
  includedItems?: string;
  priceManualOverride?: boolean;
  lockerAllowed?: boolean;
  courierAllowed?: boolean;
  brand?: string;
  model?: string;
  modelSourceUrl?: string;
  specsConfirmed?: boolean;
  itemReviewConfirmed?: boolean;
  cleanImageLicense?: string;
  researchNotes?: string;
  id: string;
  itemId: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  condition: string;
  conditionNote?: string | null;
  testingStatus?: string;
  measurementSource?: string;
  priceCents: number;
  sourceCostCents: number | null;
  supplierNotes: string | null;
  adminNotes: string | null;
  productWeightGrams: number;
  packageWeightGrams: number;
  packageLengthCm: number;
  packageWidthCm: number;
  packageHeightCm: number;
  stockQty: number;
  status: string;
  isFeatured: boolean;
  images: Array<{ id: string; url: string; alt: string | null }>;
}

const initial: AdminFormState = { ok: false };

export function ProductForm({
  product,
  categories,
  pricingSettings,
}: {
  product?: ProductFormValues | null;
  pricingSettings: PricingSettings;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(saveProductAction, initial);
  const values = state.values;
  const text = (name: string, fallback = "") => values?.[name] ?? fallback;
  const images = state.imageUrls ?? product?.images.map((image) => image.url) ?? [];
  const featured = values ? values.isFeatured === "on" : Boolean(product?.isFeatured);

  // Photo order has no field of its own: `saveProduct` writes `sortOrder` from
  // the position of each checked `imageUrls` box, so the order they appear in
  // IS the order that gets saved. The first photo is the main image — the
  // server splices `mainImageUrl` to the front anyway, so picking one moves it
  // to the front here rather than letting the two disagree.
  const [imageOrder, setImageOrder] = useState<string[]>(() => product?.images.map((image) => image.url) ?? []);
  const sourceImages = product?.images ?? [];
  const byUrl = new Map(sourceImages.map((image) => [image.url, image]));
  const kept = new Set<string>();
  const orderedImages = imageOrder.flatMap((url) => {
    const image = byUrl.get(url);
    if (!image || kept.has(url)) return [];
    kept.add(url);
    return [image];
  });
  // Anything the saved order does not mention still has to render — appending
  // keeps it visible instead of silently dropping the photo from the form.
  for (const image of sourceImages) {
    if (!kept.has(image.url)) {
      kept.add(image.url);
      orderedImages.push(image);
    }
  }

  const moveImage = (url: string, delta: -1 | 1) => {
    setImageOrder((current) => {
      const next = [...current];
      const from = next.indexOf(url);
      if (from === -1) return current;
      const to = from + delta;
      if (to < 0 || to >= next.length) return next;
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const makeMainImage = (url: string) => {
    setImageOrder((current) => [url, ...current.filter((entry) => entry !== url)]);
  };

  const [priceText, setPriceText] = useState(text("price", centsToInput(product?.priceCents ?? 0)));
  const [manualPrice, setManualPrice] = useState(values ? values.priceManualOverride === "on" : product?.priceManualOverride ?? false);
  const [costText, setCostText] = useState(text("sourceCost", centsToInput(product?.sourceCostCents)));
  const price = parseZARToCents(priceText);
  const cost = parseZARToCents(costText);
  const estimate = pricingBreakdown(cost, price, pricingSettings);
  const profit = estimate.grossProfitCents;
  const err = (key: string) => state.fieldErrors?.[key]?.[0];

  return (
    <form key={String(state.stamp ?? "base")} action={action} className="space-y-6">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <input type="hidden" name="priceManualOverride" value={manualPrice ? "on" : "off"} />
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      ) : null}

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">Listing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" error={err("name")} className="sm:col-span-2">
            <input className="input" name="name" required defaultValue={text("name", product?.name ?? "")} />
          </Field>
          <Field label="Item ID" hint="Leave blank to generate one. Shown on the order." error={err("itemId")}>
            <input className="input" name="itemId" defaultValue={text("itemId", product?.itemId ?? "")} />
          </Field>
          <Field label="SKU" hint="Leave blank to generate one." error={err("sku")}>
            <input className="input" name="sku" defaultValue={text("sku", product?.sku ?? "")} />
          </Field>
          <Field label="Category" error={err("categoryId")}>
            <select className="input" name="categoryId" required defaultValue={text("categoryId", product?.categoryId ?? "")}>
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition" error={err("condition")}>
            <select className="input" name="condition" defaultValue={text("condition", product?.condition ?? "GOOD")}>
              {PRODUCT_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {PRODUCT_CONDITION_LABELS[condition]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Condition note"
            hint="Shown on the product page. Say what this item actually looks like. Do not call it refurbished or new."
            error={err("conditionNote")}
            className="sm:col-span-2"
          >
            <textarea
              className="input min-h-20"
              name="conditionNote"
              maxLength={400}
              defaultValue={text("conditionNote", product?.conditionNote ?? "")}
              placeholder="Used — shows normal cosmetic signs of previous use, light scratches on the body."
            />
          </Field>
          <Field
            label="Testing status"
            hint="Only set Tested & working if you physically checked this exact item. The grade above says how it looks; this says whether it works."
            error={err("testingStatus")}
            className="sm:col-span-2"
          >
            <select
              className="input"
              name="testingStatus"
              defaultValue={text("testingStatus", product?.testingStatus ?? "NOT_TESTED")}
            >
              {TESTING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TESTING_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-500">{TESTING_STATUS_EXPLANATION[product?.testingStatus === "TESTED_AND_WORKING" ? "TESTED_AND_WORKING" : "NOT_TESTED"]}</p>
          </Field>
          <Field label="Manual selling price (R)" hint={manualPrice ? "Manual override is preserved when cost or pricing rules change." : "Calculated automatically from cost. Typing a price enables a manual override."} error={err("priceCents")}>
            <input
              className="input"
              name="price"
              inputMode="decimal"
              required
              value={priceText}
              onChange={(event) => { setPriceText(event.target.value); setManualPrice(true); }}
            />
          </Field>
          <Field label="Stock quantity" hint="Most second-hand items are one of a kind." error={err("stockQty")}>
            <input
              className="input"
              name="stockQty"
              type="number"
              min={0}
              defaultValue={text("stockQty", String(product?.stockQty ?? 1))}
            />
          </Field>
          <Field label="Status" error={err("status")}>
            <select className="input" name="status" defaultValue={text("status", product?.status ?? "DRAFT")}>
              {PRODUCT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PRODUCT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Specifications" hint="Known specifications only; leave unknown details blank." className="sm:col-span-2"><textarea name="specifications" className="input min-h-24" defaultValue={text("specifications", product?.specifications ?? "")} /></Field>
          <Field label="What's included" hint="List the actual accessories included with this item." className="sm:col-span-2"><textarea name="includedItems" className="input min-h-20" defaultValue={text("includedItems", product?.includedItems ?? "")} /></Field>
          <Field label="URL slug" hint="Optional. Generated from the name if you leave it blank." error={err("slug")}>
            <input className="input" name="slug" defaultValue={text("slug", product?.slug ?? "")} />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-ink-700">
            <input type="checkbox" name="isFeatured" defaultChecked={featured} />
            Feature on the homepage
          </label>
          <Field label="Description" hint="Optional. A draft description is created from the details you enter if left blank." error={err("description")} className="sm:col-span-2">
            <textarea
              className="input min-h-36"
              name="description"
              defaultValue={text("description", product?.description ?? "")}
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Catalogue verification</h2>
        <p className="text-sm text-ink-600">Brand, exact model and source links are optional. Leave unknown details blank and describe only what you know about this item. Publishing still requires actual-item review, photos, price, stock and confirmed parcel measurements.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {([ ["brand", "Brand (optional)"], ["model", "Exact model / model number (optional)"], ["modelSourceUrl", "Manufacturer / specification source URL (optional)"], ["cleanImageLicense", "Clean image source and reuse permission / owner-edited photo"] ] as const).map(([name,label]) => <Field label={label} key={name}><input className="input" name={name} defaultValue={text(name, product?.[name] ?? "")} /></Field>)}
        </div>
        <Field label="Research notes (private)"><textarea className="input min-h-24" name="researchNotes" defaultValue={text("researchNotes", product?.researchNotes ?? "")} /></Field>
        <label className="flex gap-2 text-sm"><input name="specsConfirmed" type="checkbox" defaultChecked={values ? values.specsConfirmed === "on" : product?.specsConfirmed ?? false} />Optional research confirmation: any model-specific specifications entered match this item. Unknown details can remain blank.</label>
        <label className="flex gap-2 text-sm"><input name="itemReviewConfirmed" type="checkbox" defaultChecked={values ? values.itemReviewConfirmed === "on" : product?.itemReviewConfirmed ?? false} />Actual stock, condition, wear, accessories and any locks have been checked; actual-item photos remain attached and internal cost tags are covered before publication.</label>
      </section>

      <section className="card space-y-4 border-amber-200 bg-amber-50/40 p-5">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-amber-800 uppercase">Private</h2>
          <p className="mt-1 text-sm text-ink-600">
            Source cost, supplier notes and admin notes are never shown on the store.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source cost (R)" hint="What you paid for this item." error={err("sourceCostCents")}>
            <input
              className="input"
              name="sourceCost"
              inputMode="decimal"
              value={costText}
              onChange={(event) => { const value = event.target.value; setCostText(value); if (!manualPrice) setPriceText(centsToInput(pricingBreakdown(parseZARToCents(value), null, pricingSettings).recommendedCents ?? 0)); }}
            />
          </Field>
          <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
            <p className="label">Estimated gross profit after allowances and fees</p>
            <p className="text-lg font-bold text-ink-900">{profit === null ? "—" : formatZAR(profit)}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
            <p className="label">Handling / packaging allowance</p><p>{formatZAR(estimate.allowanceCents)}</p>
            <p className="label">Recommended selling price</p><p>{estimate.recommendedCents == null ? "Cost required" : formatZAR(estimate.recommendedCents)}</p>
            <p className="label">Estimated margin</p><p>{estimate.marginPercent == null ? "Unknown" : `${estimate.marginPercent.toFixed(1)}%`}</p>
            <p className="label">Estimated payment fee allowance</p><p>{estimate.processingCents == null ? "Cost required" : formatZAR(estimate.processingCents)}</p>
            <button className="btn btn-secondary btn-sm mt-2" type="button" disabled={estimate.recommendedCents == null} onClick={() => { setPriceText(centsToInput(estimate.recommendedCents)); setManualPrice(false); }}>Use automatic recommendation</button>
          </div>
          <Field label="Where it was sourced" error={err("supplierNotes")} className="sm:col-span-2">
            <textarea
              className="input min-h-20"
              name="supplierNotes"
              defaultValue={text("supplierNotes", product?.supplierNotes ?? "")}
            />
          </Field>
          <Field label="Admin notes" error={err("adminNotes")} className="sm:col-span-2">
            <textarea
              className="input min-h-20"
              name="adminNotes"
              defaultValue={text("adminNotes", product?.adminNotes ?? "")}
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">Parcel</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex gap-2"><input type="checkbox" name="lockerAllowed" defaultChecked={values ? values.lockerAllowed === "on" : product?.lockerAllowed ?? true} />Allow locker / pickup-point service when parcel qualifies</label>
          <label className="flex gap-2"><input type="checkbox" name="courierAllowed" defaultChecked={values ? values.courierAllowed === "on" : product?.courierAllowed ?? true} />Allow door-to-door service</label>
        </div>
        <Field label="Measurement source" hint="Choose Measured only after weighing the complete parcel and measuring its outer carton. Zero values can remain in drafts.">
          <select className="input" name="measurementSource" defaultValue={text("measurementSource", normaliseMeasurementSource(product?.measurementSource ?? "ESTIMATED"))}>
            {MEASUREMENT_SOURCES.map((source) => <option key={source} value={source}>{MEASUREMENT_SOURCE_BADGE[source]} — {MEASUREMENT_SOURCE_EXPLANATION[source]}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Product weight (g)" error={err("productWeightGrams")}>
            <input
              className="input"
              name="productWeightGrams"
              type="number"
              min={0}
              required
              defaultValue={text("productWeightGrams", String(product?.productWeightGrams ?? 0))}
            />
          </Field>
          <Field label="Packaging weight (g)" error={err("packageWeightGrams")}>
            <input
              className="input"
              name="packageWeightGrams"
              type="number"
              min={0}
              defaultValue={text("packageWeightGrams", String(product?.packageWeightGrams ?? 0))}
            />
          </Field>
          <Field label="Length (cm)" error={err("packageLengthCm")}>
            <input
              className="input"
              name="packageLengthCm"
              type="number"
              min={0}
              step="0.1"
              required
              defaultValue={text("packageLengthCm", product ? String(product.packageLengthCm) : "0")}
            />
          </Field>
          <Field label="Width (cm)" error={err("packageWidthCm")}>
            <input
              className="input"
              name="packageWidthCm"
              type="number"
              min={0}
              step="0.1"
              required
              defaultValue={text("packageWidthCm", product ? String(product.packageWidthCm) : "0")}
            />
          </Field>
          <Field label="Height (cm)" error={err("packageHeightCm")}>
            <input
              className="input"
              name="packageHeightCm"
              type="number"
              min={0}
              step="0.1"
              required
              defaultValue={text("packageHeightCm", product ? String(product.packageHeightCm) : "0")}
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">Images</h2>
          <p className="mt-1 text-sm text-ink-600">
            JPEG, PNG, WebP or AVIF. Up to 12 photos, 8 MB each. The first photo is the one
            customers see first — use <strong>Earlier</strong> and <strong>Later</strong> to
            change the order, or pick a different main image.
          </p>
        </div>
        {product && product.images.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {orderedImages.map((image, index) => (
              <li key={image.id} className="rounded-lg border border-ink-200 bg-white p-2">
                {/* Admin thumbs include SVG placeholders, which next/image will not optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt ?? ""} className="aspect-square w-full rounded object-cover" />
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-700">
                  <input type="checkbox" name="imageUrls" value={image.url} defaultChecked={images.includes(image.url)} />
                  Keep
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="mainImageUrl"
                    value={image.url}
                    checked={image.url === orderedImages[0]?.url}
                    onChange={() => makeMainImage(image.url)}
                  />
                  Main image
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary min-h-0 flex-1 px-2 py-1.5 text-xs"
                    onClick={() => moveImage(image.url, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${image.alt || "photo"} earlier`}
                  >
                    Earlier
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary min-h-0 flex-1 px-2 py-1.5 text-xs"
                    onClick={() => moveImage(image.url, 1)}
                    disabled={index === orderedImages.length - 1}
                    aria-label={`Move ${image.alt || "photo"} later`}
                  >
                    Later
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <Field label="Add photos" hint="If this form is rejected, attach the new photos again.">
          <input className="input" name="images" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
        </Field>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="submit" name="saveIntent" value="DRAFT" className="btn btn-secondary" disabled={pending}>Save draft</button>
        <button type="submit" name="saveIntent" value="ACTIVE" className="btn btn-primary" disabled={pending}>Publish</button>
        {product ? <button type="submit" className="btn btn-secondary" disabled={pending}>Save changes</button> : null}
      </div>
    </form>
  );
}
