import { NextResponse } from "next/server";
import { z } from "zod";
import { getCartView } from "@/lib/dal/cart-view";
import { shippingMethodSchema, provinceSchema, postalCodeSchema } from "@/lib/validation";
import { formatZAR } from "@/lib/money";

const requestSchema = z.object({
  deliveryMethod: shippingMethodSchema.optional(),
  province: provinceSchema.optional(),
  postalCode: postalCodeSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid delivery method" }, { status: 400 });
    }

    const cart = await getCartView(parsed.data.deliveryMethod, { province: parsed.data.province, postalCode: parsed.data.postalCode });
    const quote = cart.quote;

    if (!quote) {
      return NextResponse.json({ empty: true });
    }

    return NextResponse.json({
      empty: false,
      itemCount: cart.itemCount,
      subtotalCents: cart.subtotalCents,
      method: quote.method,
      shippingCents: quote.shippingCents,
      totalCents: cart.subtotalCents + quote.shippingCents,
      error: quote.error ?? null,
      matchedTierCode: quote.matchedTierCode ?? null,
      matchedTierName: quote.matchedTierName ?? null,
      parcel: {
        weightGrams: quote.parcel.weightGrams,
        lengthCm: quote.parcel.lengthCm,
        widthCm: quote.parcel.widthCm,
        heightCm: quote.parcel.heightCm,
      },
      methods: quote.methods.map((method) => ({
        method: method.method,
        available: method.available,
        priceCents: method.priceCents,
        fuelSurchargeCents: method.fuelSurchargeCents,
        unavailableReason: method.unavailableReason ?? null,
        etaMinDays: method.etaMinDays,
        etaMaxDays: method.etaMaxDays,
      })),
      formatted: {
        subtotal: formatZAR(cart.subtotalCents),
        shipping: formatZAR(quote.shippingCents),
        total: formatZAR(cart.subtotalCents + quote.shippingCents),
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not calculate delivery" }, { status: 500 });
  }
}
