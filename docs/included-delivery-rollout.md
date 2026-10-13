# Bargainshop: delivery included in product prices (staged, OFF by default)

The customer wants a single item price with no delivery fee added at checkout, while maintaining net margin.
Preferred selling price band: **R400–R5,000**. Source, courier and payment costs remain private.

## Safety gate

Do NOT activate `NEXT_PUBLIC_DELIVERY_INCLUDED_IN_PRICES=true` until:

1. All existing ACTIVE products have confirmed acquisition costs, stock and packed shipping dimensions.
2. Current service-specific courier tariff and destination coverage are confirmed. Unavailable services stay unavailable.
3. The price on EVERY active product covers purchase cost, allocated petrol/collection, packaging, **the highest eligible courier cost** (door surcharge included if offered), payment gateway fees and the intended net profit. Existing manual price overrides remain unchanged until individually reviewed.
4. A test cart of single and multiple items, a shipping service switch, and a real gateway sandbox payment verify the price shown equals the amount charged, with R0 customer delivery and a positive internal courier cost.
5. Shipping restrictions for oversized items and unavailable destinations are kept; do not promise delivery where no service is available.

Review product by product using Admin → Pricing → Delivery included calculator. Example assumptions R100 petrol, R30 packing, R500 net profit and 3% payment fee are editable **estimates**; enter each actual courier rate, do not treat unknown shipping as R0.

## Effect of feature flag

- OFF (default): existing product prices, paid courier quotes and checkout remain unchanged.
- ON (only after completed margin review): customer sees FREE for confirmed eligible delivery methods; checkout shipping is R0, item subtotal is the payable total.
- The original actual courier expense is still recorded in private order shipping-quote metadata.
- No listed prices or inventory are modified automatically.
- Rates and parcel validation continue to gate checkout.

To roll back: turn the flag OFF and redeploy. No migration is needed.
