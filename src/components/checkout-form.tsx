"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { submitCheckoutAction, type CheckoutState } from "@/app/actions/checkout";
import { ZA_PROVINCES, type ShippingMethod } from "@/lib/enums";
import { formatZAR, formatWeight, formatDimensions } from "@/lib/money";
import { Alert, ConditionBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  DELIVERY_COURIER,
  DELIVERY_ESTIMATE,
} from "@/lib/shipping/policy";

export interface QuoteResponse {
  empty: boolean;
  itemCount: number;
  subtotalCents: number;
  method: ShippingMethod;
  shippingCents: number;
  totalCents: number;
  freeShippingApplied: boolean;
  freeShippingRemainingCents: number;
  error: string | null;
  lockerEligible: boolean;
  lockerBlockers: string[];
  parcel: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number };
  methods: Array<{
    method: ShippingMethod;
    available: boolean;
    priceCents: number;
    unavailableReason: string | null;
    etaMinDays: number;
    etaMaxDays: number;
  }>;
  formatted: { subtotal: string; shipping: string; total: string };
}

export interface CheckoutItem {
  slug: string;
  name: string;
  imageUrl?: string;
  condition: string;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export function CheckoutForm({
  items,
  initialQuote,
  checkoutOpen,
  paymentLabel,
}: {
  items: CheckoutItem[];
  initialQuote: QuoteResponse;
  checkoutOpen: boolean;
  paymentLabel: string;
}) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    submitCheckoutAction,
    { ok: false },
  );
  const [method, setMethod] = useState<ShippingMethod>(initialQuote.method);
  const [quote, setQuote] = useState<QuoteResponse>(initialQuote);
  const [isPending, startTransition] = useTransition();
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");

  const errors = state.fieldErrors ?? {};
  const fieldError = (name: string) => errors[name]?.[0];

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => startTransition(async () => {
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/shipping/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryMethod: method, ...(province ? { province } : {}), ...(/^\d{4}$/.test(postalCode) ? { postalCode } : {}) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Delivery could not be calculated. Check the address and try again.");
        const data = await response.json() as QuoteResponse;
        if (!data.empty) setQuote(data);
        setQuoteError("");
      } catch (error) { if (!controller.signal.aborted) setQuoteError(error instanceof Error ? error.message : "Delivery unavailable"); }
      finally { if (!controller.signal.aborted) setQuoteLoading(false); }
    }), 250);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [method, province, postalCode]);

  // A POST gateway (PayFast) has to be reached by submitting a signed form.
  // The order already exists at this point; this just hands the customer over.
  useEffect(() => {
    if (state.gatewayForm) {
      document.forms.namedItem("gateway-handoff")?.submit();
    }
  }, [state.gatewayForm]);

  if (state.gatewayForm) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h2 className="heading-section text-lg text-ink-900">Taking you to the secure payment page</h2>
        <p className="mt-2 text-sm text-ink-600">
          Your order is saved. If you are not redirected automatically, continue to payment below.
        </p>
        <form
          name="gateway-handoff"
          method="post"
          action={state.gatewayForm.action}
          className="mt-5"
        >
          {Object.entries(state.gatewayForm.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button type="submit" className="btn btn-primary btn-lg w-full">
            Continue to payment
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_23rem] lg:gap-8">
      <div className="space-y-6">
        {!checkoutOpen ? (
          <Alert tone="warning" title="Online checkout is not available yet">
            We are not able to take payment on the website at the moment. Please{" "}
            <a href="/contact" className="font-semibold underline">
              contact us
            </a>{" "}
            and we will take your order directly.
          </Alert>
        ) : null}

        <section className="card p-5 sm:p-6">
          <h2 className="heading-section mb-4 text-lg text-ink-900">Contact details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              name="fullName"
              autoComplete="name"
              error={fieldError("fullName")}
              required
              className="sm:col-span-2"
            />
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              error={fieldError("email")}
              required
            />
            <Field
              label="Mobile number"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="082 123 4567"
              error={fieldError("phone")}
              required
            />
          </div>
          <p className="hint mt-3">
            We use your email and mobile number to send your order confirmation and delivery updates.
          </p>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="heading-section mb-1 text-lg text-ink-900">Delivery address</h2>
          <p className="mb-4 text-sm text-ink-500">
            This is where the parcel will be delivered. Please check it carefully.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Street address"
              name="line1"
              autoComplete="address-line1"
              error={fieldError("line1")}
              required
              className="sm:col-span-2"
            />
            <Field
              label="Apartment, unit or complex (optional)"
              name="line2"
              autoComplete="address-line2"
              error={fieldError("line2")}
              className="sm:col-span-2"
            />
            <Field
              label="Suburb"
              name="suburb"
              autoComplete="address-level3"
              error={fieldError("suburb")}
              required
            />
            <Field
              label="City"
              name="city"
              autoComplete="address-level2"
              error={fieldError("city")}
              required
            />

            <div>
              <label htmlFor="province" className="label">
                Province <span className="text-danger-600">*</span>
              </label>
              <select
                id="province"
                name="province"
                required
                value={province}
                onChange={(event) => { setProvince(event.target.value); setQuoteLoading(true); }}
                aria-invalid={Boolean(fieldError("province"))}
                className="input"
              >
                <option value="" disabled>
                  Select a province
                </option>
                {ZA_PROVINCES.map((province) => (
                  <option key={province.code} value={province.code}>
                    {province.name}
                  </option>
                ))}
              </select>
              {fieldError("province") ? (
                <p className="error-text">{fieldError("province")}</p>
              ) : null}
            </div>

            <Field
              label="Postal code"
              name="postalCode"
              value={postalCode}
              onChange={(event) => { setPostalCode(event.target.value); setQuoteLoading(true); }}
              autoComplete="postal-code"
              inputMode="numeric"
              placeholder="2196"
              maxLength={4}
              error={fieldError("postalCode")}
              required
            />
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="heading-section mb-1 text-lg text-ink-900">Delivery method</h2>
          {quoteLoading ? <p role="status" className="text-sm">Updating delivery for your destination...</p> : null}
          {quoteError ? <p role="alert" className="error-text">{quoteError}</p> : null}
          {!quoteLoading && quote.error ? <p role="status" className="mb-3 text-sm text-ink-600">{quote.error}</p> : null}
          <input type="hidden" name="quotedShippingCents" value={quote.shippingCents} />
          <input type="hidden" name="quotedSubtotalCents" value={quote.subtotalCents} />
          {method === "LOCKER" ? <div className="mb-4"><label className="label" htmlFor="pickupPoint">Locker / pickup-point name, address and reference</label><input id="pickupPoint" name="pickupPoint" className="input" required maxLength={300} /><p className="error-text">{fieldError("pickupPoint")}</p></div> : null}
          <p className="mb-4 text-sm text-ink-500">
            {DELIVERY_COURIER} delivery is paid by you, shown at checkout separately from item prices.{" "}
            <a href="/shipping" className="font-semibold text-brand-700 hover:underline">
              How this is calculated
            </a>
            .
          </p>

          <div className="space-y-2.5">
            {(quote.methods.filter((entry) => entry.available).map((entry) => entry.method) as ShippingMethod[]).map((option) => {
              const optionQuote = quote.methods.find((entry) => entry.method === option);
              const selected = method === option;

              return (
                <label
                  key={option}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3.5 transition-colors",
                    !optionQuote?.available && "cursor-not-allowed border-ink-200 bg-ink-50 opacity-70",
                    optionQuote?.available &&
                      (selected
                        ? "cursor-pointer border-brand-600 bg-brand-50"
                        : "cursor-pointer border-ink-200 hover:border-ink-400"),
                  )}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value={option}
                    checked={selected}
                    disabled={!optionQuote?.available}
                    onChange={() => { setMethod(option); setQuoteLoading(true); }}
                    required
                    className="mt-1 accent-brand-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink-900">
                        {option === "LOCKER" ? "Locker delivery" : DELIVERY_COURIER}
                      </span>
                      {optionQuote?.available ? (
                        <span className="shrink-0 font-bold text-ink-900 tabular-nums">
                          {formatZAR(optionQuote.priceCents)}
                        </span>
                      ) : null}
                    </div>

                    {optionQuote?.available ? (
                      <p className="mt-0.5 text-xs text-ink-600">
                        {option === "LOCKER"
                          ? "Collect from a collection point near you."
                          : "Delivered to your street address."}{" "}
                        {option === "COURIER" ? DELIVERY_ESTIMATE : "Estimated delivery time shown before dispatch."}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-ink-500">
                        Not available: {optionQuote?.unavailableReason ?? "no price bracket set"}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg bg-ink-50 px-3.5 py-3 text-xs text-ink-600">
            <p>
              <span className="font-semibold text-ink-800">Parcel:</span>{" "}
              {formatWeight(quote.parcel.weightGrams)},{" "}
              {formatDimensions(quote.parcel.lengthCm, quote.parcel.widthCm, quote.parcel.heightCm)}
            </p>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="heading-section mb-1 text-lg text-ink-900">Order notes (optional)</h2>
          <p className="mb-4 text-sm text-ink-500">
            Delivery instructions, or anything we should know about the order.
          </p>
          <div>
            <label htmlFor="orderNotes" className="sr-only">
              Order notes
            </label>
            <textarea
              id="orderNotes"
              name="orderNotes"
              rows={4}
              maxLength={1000}
              placeholder="e.g. Please call before delivering. The gate is locked."
              aria-invalid={Boolean(fieldError("orderNotes"))}
              className="input resize-y"
            />
            {fieldError("orderNotes") ? (
              <p className="error-text">{fieldError("orderNotes")}</p>
            ) : null}
          </div>
        </section>
      </div>

      <aside>
        <div className="card sticky top-24 overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-5 py-4">
            <h2 className="text-sm font-bold text-ink-900">
              Your order ({quote.itemCount} {quote.itemCount === 1 ? "item" : "items"})
            </h2>
          </div>

          <ul className="divide-y divide-ink-100">
            {items.map((item) => (
              <li key={item.slug} className="flex gap-3 p-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-ink-100">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <ConditionBadge condition={item.condition} />
                    <span className="text-xs text-ink-500">× {item.quantity}</span>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink-900 tabular-nums">
                  {formatZAR(item.lineTotalCents)}
                </p>
              </li>
            ))}
          </ul>

          <div className="space-y-2.5 border-t border-ink-100 p-5">
            <SummaryRow label="Items subtotal" value={formatZAR(quote.subtotalCents)} />
            <SummaryRow
              label={`Delivery (${method === "LOCKER" ? "locker" : "courier"})`}
              value={quoteLoading || isPending ? "Updating..." : quote.error || quoteError ? "Awaiting address / quote" : formatZAR(quote.shippingCents)}
            />

            {quote.freeShippingApplied ? (
              <p className="rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800">
                Free delivery applied
              </p>
            ) : null}

            {quote.freeShippingRemainingCents > 0 ? (
              <p className="rounded-md bg-brand-50 px-3 py-1.5 text-xs text-brand-900">
                Add {formatZAR(quote.freeShippingRemainingCents)} more for free delivery
              </p>
            ) : null}

            <div className="flex items-center justify-between border-t border-ink-200 pt-2.5">
              <span className="text-base font-bold text-ink-900">Total</span>
              <span className="text-xl font-bold tracking-tight text-ink-900 tabular-nums">
                {quoteLoading || isPending ? "Updating..." : quote.error || quoteError ? "Awaiting shipping" : formatZAR(quote.totalCents)}
              </span>
            </div>
          </div>

          <div className="space-y-3 border-t border-ink-100 p-5">
            {state.error ? (
              <Alert tone="danger" className="text-sm">
                {state.error}
                {state.unavailable && state.unavailable.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    {state.unavailable.map((item, index) => (
                      <li key={index}>
                        <span className="font-medium">{item.name}</span> — {item.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
            ) : null}

            <button
              type="submit"
              disabled={pending || isPending || quoteLoading || Boolean(quoteError) || !checkoutOpen || quote.error !== null}
              className="btn btn-primary btn-lg w-full"
            >
              {pending ? "Placing your order…" : "Place order"}
            </button>

            <p className="text-center text-xs text-ink-500">
              Payment method: <span className="font-medium text-ink-700">{paymentLabel}</span>
            </p>

            <p className="text-center text-xs text-ink-500">
              We only use your details to deliver this order. See our{" "}
              <a href="/privacy" className="underline hover:text-ink-700">
                privacy policy
              </a>
              .
            </p>
          </div>
        </div>
      </aside>

      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  error,
  required,
  className,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label} {required ? <span className="text-danger-600">*</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className="input"
        {...rest}
      />
      {error ? (
        <p id={`${name}-error`} className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="font-medium text-ink-900 tabular-nums">{value}</span>
    </div>
  );
}
