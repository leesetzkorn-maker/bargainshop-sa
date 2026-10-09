import type { Metadata } from "next";
import { InfoPage, PolicyLinks } from "@/components/info-page";
import { DELIVERY_COURIER, DELIVERY_ESTIMATE } from "@/lib/shipping/policy";

export const metadata: Metadata = {
  title: "Delivery & shipping",
  description: "Customer-paid The Courier Guy locker delivery, charged separately at checkout.",
  alternates: { canonical: "/shipping" },
};

/** The Courier Guy locker tariff card, incl. VAT. Door prices exclude the
 *  monthly fuel surcharge, which is added at checkout only once confirmed. */
const SIZES = [
  { size: "XS", box: "60 × 17 × 8 cm", max: "2 kg", l2l: "R59", l2d: "R79", l2k: "R69" },
  { size: "S", box: "60 × 41 × 8 cm", max: "5 kg", l2l: "R69", l2d: "R89", l2k: "R79" },
  { size: "M", box: "60 × 41 × 19 cm", max: "10 kg", l2l: "R79", l2d: "R119", l2k: "R89" },
  { size: "L", box: "60 × 41 × 41 cm", max: "15 kg", l2l: "R109", l2d: "R176", l2k: "R129" },
  { size: "XL", box: "60 × 41 × 69 cm", max: "20 kg", l2l: "R149", l2d: "R239", l2k: "R169" },
];

export default async function ShippingPage() {
  return (
    <InfoPage
      title="Delivery & shipping"
      breadcrumbs={[{ label: "Delivery" }]}
      intro={`We dispatch from a The Courier Guy locker. Delivery is charged at cost from The Courier Guy's published locker tariff card and is shown separately before you pay.`}
      sections={[
        {
          heading: "How your delivery price is worked out",
          body: (
            <>
              <p>Your whole order is packed and sent as a single parcel. We match that parcel to the smallest locker size (XS to XL) whose inner dimensions and weight limit it fits into, allowing for rotation of the box. You are then charged the published price for the service you choose at that size.</p>
              <p>We do not estimate, round up or invent a price. The weight and box size come from the item&apos;s own recorded measurements.</p>
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
          heading: "Parcel sizes and prices",
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
              <p className="mt-2 text-xs text-ink-500">All prices include VAT. Locker-to-door prices exclude The Courier Guy&apos;s monthly fuel surcharge, which we only add once we have confirmed the official figure; until then, to-door delivery is shown as unavailable so you are never quoted a guessed price.</p>
            </>
          ),
        },
        {
          heading: "Oversized or heavy orders",
          body: (
            <>
              <p>If your packed order is bigger than the XL size, checkout cannot quote it online. Please contact us and we will arrange a delivery price for you.</p>
              <p>{DELIVERY_ESTIMATE}</p>
            </>
          ),
        },
        {
          heading: "Dispatch and tracking",
          body: <p>Processing time can apply before dispatch. Tracking details are added to your order once dispatched, and shipping is charged separately from the item price. All parcels are sent with {DELIVERY_COURIER}.</p>,
        },
      ]}
    >
      <div className="mt-6"><PolicyLinks /></div>
    </InfoPage>
  );
}
