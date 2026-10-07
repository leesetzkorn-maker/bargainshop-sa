import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCartView } from "@/lib/dal/cart-view";
import { CheckoutForm } from "@/components/checkout-form";
import { getPaymentProvider, isCheckoutOpen } from "@/lib/payments/registry";
import { formatZAR } from "@/lib/money";
import { copy } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your order.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const params = await searchParams;
  const cart = await getCartView();

  if (cart.lines.length === 0 || !cart.quote) {
    redirect("/cart");
  }

  const quote = cart.quote;
  const provider = getPaymentProvider();

  const items = cart.lines.map((line) => ({
    slug: line.product.slug,
    name: line.product.name,
    imageUrl: line.product.images[0]?.url,
    condition: line.product.condition,
    priceCents: line.product.priceCents,
    quantity: line.quantity,
    lineTotalCents: line.lineTotalCents,
  }));

  const initialQuote = {
    empty: false,
    itemCount: cart.itemCount,
    subtotalCents: cart.subtotalCents,
    method: quote.method,
    shippingCents: quote.shippingCents,
    totalCents: cart.subtotalCents + quote.shippingCents,
    freeShippingApplied: quote.freeShippingApplied,
    freeShippingRemainingCents: quote.freeShippingRemainingCents,
    error: quote.error ?? null,
    lockerEligible: quote.lockerEligible,
    lockerBlockers: quote.lockerBlockers,
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
      unavailableReason: method.unavailableReason ?? null,
      etaMinDays: method.etaMinDays,
      etaMaxDays: method.etaMaxDays,
    })),
    formatted: {
      subtotal: formatZAR(cart.subtotalCents),
      shipping: formatZAR(quote.shippingCents),
      total: formatZAR(cart.subtotalCents + quote.shippingCents),
    },
  };

  const cancelled = Array.isArray(params.cancelled) ? params.cancelled[0] : params.cancelled;

  return (
    <div className="container-page py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/cart" className="hover:text-ink-800 hover:underline">
              Cart
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="font-medium text-ink-700" aria-current="page">
              Checkout
            </span>
          </li>
        </ol>
      </nav>

      <h1 className="heading-section mb-2 text-2xl text-ink-900 sm:text-3xl">Checkout</h1>
      <p className="mb-6 text-sm text-ink-600">
        {copy.whatWeDo} Placing the order takes the listing off the site. We still have to secure the physical item before it can ship.
      </p>

      {cancelled ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Payment was cancelled, so nothing has been charged. Your cart is still here whenever you are
          ready.
        </div>
      ) : null}

      <CheckoutForm
        items={items}
        initialQuote={initialQuote}
        checkoutOpen={isCheckoutOpen()}
        paymentLabel={provider.label}
      />
    </div>
  );
}
