/**
 * Private, provisional pricing math for products offered with courier delivery included.
 * All money values are integer cents; an unknown courier quote is never taken as R0.
 * This helper does not mutate any live product price.
 */
export interface IncludedDeliveryCosts {
  purchaseCents: number;
  petrolCents: number;
  packagingCents: number;
  courierCents: number;
  targetProfitCents: number;
  paymentFeePercent: number;
  paymentFeeFixedCents: number;
}

export function recommendIncludedDeliveryPrice(costs: IncludedDeliveryCosts): number | null {
  const money = [
    costs.purchaseCents, costs.petrolCents, costs.packagingCents,
    costs.courierCents, costs.targetProfitCents, costs.paymentFeeFixedCents,
  ];
  if (money.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  if (!Number.isFinite(costs.paymentFeePercent) || costs.paymentFeePercent < 0 || costs.paymentFeePercent >= 100) return null;
  const base = money.reduce((sum, value) => sum + value, 0);
  const raw = Math.ceil(base / (1 - costs.paymentFeePercent / 100));
  if (!Number.isSafeInteger(raw)) return null;
  const result = Math.ceil(raw / 100) * 100; // round UP to the next whole rand
  return Number.isSafeInteger(result) ? result : null;
}

export function profitAfterIncludedDelivery(priceCents: number, costs: IncludedDeliveryCosts): number | null {
  if (recommendIncludedDeliveryPrice(costs) === null || !Number.isSafeInteger(priceCents) || priceCents < 0) return null;
  const fee = Math.ceil(priceCents * costs.paymentFeePercent / 100) + costs.paymentFeeFixedCents;
  return priceCents - costs.purchaseCents - costs.petrolCents - costs.packagingCents - costs.courierCents - fee;
}
