"use client";

import { useState } from "react";
import { Field } from "@/components/admin/ui";
import { formatZAR, parseZARToCents } from "@/lib/money";
import { profitAfterIncludedDelivery, recommendIncludedDeliveryPrice } from "@/lib/pricing-free-delivery";

export function IncludedDeliveryCalculator() {
  const [purchase, setPurchase] = useState("");
  const [petrol, setPetrol] = useState("100");
  const [packaging, setPackaging] = useState("30");
  const [courier, setCourier] = useState("");
  const [profit, setProfit] = useState("500");
  const [feePercent, setFeePercent] = useState("3");
  const [feeFixed, setFeeFixed] = useState("0");

  const purchaseCents = parseZARToCents(purchase);
  const petrolCents = parseZARToCents(petrol);
  const packagingCents = parseZARToCents(packaging);
  const courierCents = parseZARToCents(courier);
  const profitCents = parseZARToCents(profit);
  const fixedCents = parseZARToCents(feeFixed);
  const percent = feePercent.trim() ? Number(feePercent) : Number.NaN;
  const complete = [purchaseCents, petrolCents, packagingCents, courierCents, profitCents, fixedCents].every((x) => x !== null)
    && Number.isFinite(percent) && percent >= 0 && percent < 100;
  const costs = complete ? {
    purchaseCents: purchaseCents!, petrolCents: petrolCents!, packagingCents: packagingCents!,
    courierCents: courierCents!, targetProfitCents: profitCents!, paymentFeePercent: percent,
    paymentFeeFixedCents: fixedCents!,
  } : null;
  const recommended = costs ? recommendIncludedDeliveryPrice(costs) : null;
  const net = costs && recommended !== null ? profitAfterIncludedDelivery(recommended, costs) : null;

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-bold text-ink-900">Delivery included: selling-price calculator</h2>
      <p className="text-sm text-ink-600">
        Work out one final selling price including petrol, packaging, confirmed courier costs,
        payment fees and desired profit. This is a preview only: it does not edit product prices or change the live checkout.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ["Item purchase price (R)", purchase, setPurchase],
          ["Petrol / collection (R)", petrol, setPetrol],
          ["Packaging (R)", packaging, setPackaging],
          ["Confirmed courier quote (R)", courier, setCourier],
          ["Desired net profit (R)", profit, setProfit],
          ["Fixed payment fee (R)", feeFixed, setFeeFixed],
        ] as const).map(([label, value, setter]) => (
          <Field key={label} label={label}>
            <input className="input" inputMode="decimal" value={value}
              onChange={(event) => setter(event.target.value)}
              placeholder={label.startsWith("Confirmed") ? "Enter actual rate (required)" : "0"} />
          </Field>
        ))}
        <Field label="Payment fee (%)">
          <input className="input" inputMode="decimal" value={feePercent}
            onChange={(event) => setFeePercent(event.target.value)} />
        </Field>
      </div>
      {recommended !== null && net !== null ? (
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
          <p className="text-sm font-semibold text-ink-700">Suggested delivery-included price</p>
          <p className="text-2xl font-bold text-ink-900">{formatZAR(recommended)}</p>
          <p className="mt-1 text-sm text-ink-700">Estimated profit after listed costs: {formatZAR(net)}</p>
          {recommended < 40_000 || recommended > 500_000 ? (
            <p className="mt-2 text-sm text-danger-700">Outside your R400–R5,000 range. Recheck the bargain and margin before listing.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-medium text-ink-600">Enter the purchase price and a confirmed courier quote to calculate a final price.</p>
      )}
      <p className="text-xs text-ink-500">
        R100 petrol, R30 packaging, R500 profit and 3% payment fees are editable starting examples,
        not verified supplier rates. Share petrol fairly across items bought on the same trip.
        Allow for the most expensive eligible courier service and confirmed fuel surcharge;
        consider repairs, returns, tax and any other costs before publishing.
      </p>
    </section>
  );
}
