import type { Metadata } from "next";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { DELIVERY_COURIER, DELIVERY_ESTIMATE } from "@/lib/shipping/policy";

export const metadata: Metadata = {
  title: "Delivery & shipping",
  description: "Included delivery on eligible orders, with no extra charge at checkout.",
  alternates: { canonical: "/shipping" },
};

/** Supported parcel dimensions; included delivery depends on available service. */
const SIZES = [
  { size: "XS", box: "60 × 17 × 8 cm", max: "2 kg", l2l: "Included", l2d: "Included", l2k: "Included" },
  { size: "S", box: "60 × 41 × 8 cm", max: "5 kg", l2l: "Included", l2d: "Included", l2k: "Included" },
  { size: "M", box: "60 × 41 × 19 cm", max: "10 kg", l2l: "Included", l2d: "Included", l2k: "Included" },
  { size: "L", box: "60 × 41 × 41 cm", max: "15 kg", l2l: "Included", l2d: "Included", l2k: "Included" },
  { size: "XL", box: "60 × 41 × 69 cm", max: "20 kg", l2l: "Included", l2d: "Included", l2k: "Included" },
];

export default async function ShippingPage() {
  return (
    <InfoPage
      title="Delivery & shipping"
      breadcrumbs={[{ label: "Delivery" }]}
      intro={`We dispatch with The Courier Guy. Delivery is included in the listed price for available services, with no extra charge at checkout.`}
      sections={[
        {
          heading: "How included delivery works",
          body: (
            <>
              <p>Your whole order is packed and sent as a single parcel. We match that parcel to the smallest locker size (XS to XL) whose inner dimensions and weight limit it fits into, allowing for rotation of the box. We cover the courier charge for an eligible service you choose at that size.</p>
              <p>The weight and box size come from the item&apos;s recorded measurements. Available delivery methods carry no extra checkout charge.</p>
            </>
          ),
        },
        {
          heading: "Delivery options",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li><span className="font-medium">Locker to locker</span> — collect your parcel from a The Courier Guy locker near you.</li>
              <li><span className="font-medium">Locker to kiosk</span> — collect your parcel from a The Courier Guy kiosk near you.</li>
              <li><span className="font-medium">Locker to door</span> — The Courier Guy delivers to your street address.</li>
            </ul>
          ),
        },
        {
          heading: "Eligible parcel sizes and included delivery",
          body: (
            <>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                      <th className="py-2 pr-3 font-semibold">Size</th>
                      <th className="py-2 pr-3 font-semibold">Box (max)</th>
                      <th className="py-2 pr-3 font-semibold">Weight</th>
                      <th className="py-2 pr-3 font-semibold">Locker&nbsp;→&nbsp;locker</th>
                      <th className="py-2 pr-3 font-semibold">Locker&nbsp;→&nbsp;door</th>
                      <th className="py-2 font-semibold">Locker&nbsp;→&nbsp;kiosk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIZES.map((row) => (
                      <tr key={row.size} className="border-b border-ink-100 tabular-nums">
                        <td className="py-2 pr-3 font-semibold text-ink-900">{row.size}</td>
                        <td className="py-2 pr-3">{row.box}</td>
                        <td className="py-2 pr-3">{row.max}</td>
                        <td className="py-2 pr-3">{row.l2l}</td>
                        <td className="py-2 pr-3">{row.l2d}</td>
                        <td className="py-2">{row.l2k}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-500">Included delivery applies only to available methods for the parcel. Door delivery may be unavailable while courier surcharges are unconfirmed.</p>
            </>
          ),
        },
        {
          heading: "Oversized or heavy orders",
          body: (
            <>
              <p>If your packed order is bigger than the XL size, checkout cannot quote it online. Please contact us to discuss a suitable delivery arrangement before ordering.</p>
              <p>{DELIVERY_ESTIMATE}</p>
            </>
          ),
        },
        {
          heading: "Dispatch and tracking",
          body: <p>Processing time can apply before dispatch. Tracking details are added to your order once dispatched, and eligible delivery is included in the item price. All parcels are sent with {DELIVERY_COURIER}.</p>,
        },
      ]}
    >
      <div className="mt-6"><PolicyLinks /></div>
    </InfoPage>
  );
}
