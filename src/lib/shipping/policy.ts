/** Owner-confirmed delivery service and customer-facing estimate. */
export const DELIVERY_COURIER = "The Courier Guy";
export const DELIVERY_ESTIMATE =
  "Estimated delivery typically 1–3 working days depending on destination and courier service.";

/** Staged OFF by default. Enable only after all active selling prices cover courier and sourcing costs. */
export const DELIVERY_INCLUDED_IN_PRICES =
  process.env.NEXT_PUBLIC_DELIVERY_INCLUDED_IN_PRICES === "true";

export function customerDeliveryCents(actualCourierCostCents: number): number {
  return DELIVERY_INCLUDED_IN_PRICES ? 0 : actualCourierCostCents;
}
