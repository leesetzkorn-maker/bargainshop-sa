import type { Metadata } from "next";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { DELIVERY_COURIER, DELIVERY_ESTIMATE } from "@/lib/shipping/policy";
import { TCG_LOCKER_SIZES } from "@/lib/shipping/engine";
import { formatZAR } from "@/lib/money";

export const metadata: Metadata = {
  title: "Delivery & shipping",
  description: "Customer-paid The Courier Guy delivery, charged separately at checkout.",
  alternates: { canonical: "/shipping" },
};

export default async function ShippingPage() {
  return (
    <InfoPage
      title="Delivery & shipping"
      breadcrumbs={[{ label: "Delivery" }]}
      intro={`All products are shipped with ${DELIVERY_COURIER}.`}
      sections={[
        { heading: "Expected delivery", body: <><p>{DELIVERY_ESTIMATE}</p><p>The estimate starts when your parcel is handed to the courier. It does not start when you place your order. Your tracking information will show the progress of your shipment.</p></> },
        { heading: "Shipping cost", body: <><p>You pay the product selling price plus shipping. Shipping is shown separately before you place your order.</p><p>Rates depend on the parcel weight, outer dimensions, destination and selected service. If a rate is unavailable, checkout is blocked until delivery can be quoted.</p></> },
        { heading: "Locker delivery", body: <><p>We drop your parcel at a Courier Guy locker. You collect at your chosen destination locker. The smallest size that fits the packed dimensions and weight determines the price; VAT is included.</p><div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><thead><tr><th className="p-2">Size</th><th className="p-2">Maximum dimensions</th><th className="p-2">Maximum weight</th><th className="p-2">Locker to locker</th></tr></thead><tbody>{TCG_LOCKER_SIZES.map((entry) => <tr key={entry.size} className="border-t"><td className="p-2">{entry.size}</td><td className="p-2">{entry.dimensions.join(" × ")} cm</td><td className="p-2">{entry.maxWeightGrams / 1000} kg</td><td className="p-2">{formatZAR(entry.lockerCents)}</td></tr>)}</tbody></table></div><p className="mt-3">Rate card effective 1 September 2026. No fixed R100 fee or free-shipping discount applies. For several items, checkout uses conservative combined outer dimensions. Oversized, overweight or unmeasured parcels require a separate quote.</p></> },
        { heading: "Door delivery", body: <p>Locker-to-door rates exclude the monthly fuel surcharge. Door delivery is offered only once the current surcharge has been confirmed and included in the full checkout price. Otherwise choose locker delivery. Kiosk and door-to-door services require a separate quote.</p> },
        { heading: "Dispatch and tracking", body: <><p>Processing time can apply before dispatch. Tracking details are added to your order once dispatched.</p><p>{DELIVERY_ESTIMATE}</p></> },
      ]}
    >
      <div className="mt-6"><PolicyLinks /></div>
    </InfoPage>
  );
}
