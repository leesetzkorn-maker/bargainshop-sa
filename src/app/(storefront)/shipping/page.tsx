import type { Metadata } from "next";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { DELIVERY_COURIER, DELIVERY_ESTIMATE } from "@/lib/shipping/policy";

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
        { heading: "Delivery options", body: <p>Door-to-door delivery is available where configured. Locker or pickup-point delivery is offered only for eligible parcels and configured services.</p> },
        { heading: "Dispatch and tracking", body: <><p>Processing time can apply before dispatch. Tracking details are added to your order once dispatched.</p><p>{DELIVERY_ESTIMATE}</p></> },
      ]}
    >
      <div className="mt-6"><PolicyLinks /></div>
    </InfoPage>
  );
}
