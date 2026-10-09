import Link from "next/link";
import type { Metadata } from "next";
import { getCartView } from "@/lib/dal/cart-view";
import { removeFromCartAction } from "@/app/actions/cart";
import { CartLine } from "@/components/cart-line";
import { Alert, EmptyState } from "@/components/ui";
import { formatZAR } from "@/lib/money";
import { copy } from "@/lib/brand";
import { SHIPPING_METHOD_LABELS } from "@/lib/enums";
import { DELIVERY_COURIER, DELIVERY_ESTIMATE } from "@/lib/shipping/policy";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review the second-hand items in your cart before checkout.",
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  const cart = await getCartView();

  if (cart.lines.length === 0) {
    return (
      <div className="container-page py-12 sm:py-16">
        <h1 className="heading-section mb-6 text-2xl text-ink-900 sm:text-3xl">Your cart</h1>
        <EmptyState
          title="Your cart is empty"
          description="Have a look at what is in stock — new second-hand items come in regularly, and most are one-off."
          action={
            <Link href="/shop" className="btn btn-primary btn-lg">
              Start shopping
            </Link>
          }
        />
      </div>
    );
  }

  const quote = cart.quote;
  const shippingCents = quote?.shippingCents ?? 0;
  const totalCents = cart.subtotalCents + shippingCents;
  const canShip = Boolean(quote && !quote.error);

  return (
    <div className="container-page py-8 sm:py-10">
      <h1 className="heading-section mb-6 text-2xl text-ink-900 sm:text-3xl">Your cart</h1>

      {cart.removed.length > 0 ? (
        <Alert tone="warning" title="Some items were removed" className="mb-6">
          <ul className="list-disc space-y-0.5 pl-4">
            {cart.removed.map((item, index) => (
              <li key={index}>
                <span className="font-medium">{item.name}</span> — {item.reason}.
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-8">
        <section aria-label="Cart items">
          <ul className="card divide-y divide-ink-100 overflow-hidden">
            {cart.lines.map((line) => (
              <li key={line.product.id} className="p-4">
                <CartLine
                  slug={line.product.slug}
                  name={line.product.name}
                  imageUrl={line.product.images[0]?.url}
                  condition={line.product.condition}
                  unitPriceCents={line.product.priceCents}
                  quantity={line.quantity}
                  maxQuantity={line.product.stockQty}
                  lineTotalCents={line.lineTotalCents}
                  removeAction={removeFromCartAction}
                />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Link href="/shop" className="btn btn-ghost btn-sm">
              ← Continue shopping
            </Link>
          </div>
        </section>

        <aside>
          <div className="card sticky top-24 overflow-hidden">
            <div className="border-b border-ink-100 bg-ink-50 px-5 py-4">
              <h2 className="text-sm font-bold text-ink-900">Order summary</h2>
            </div>

            <div className="space-y-3 p-5">
              <SummaryRow
                label={`Items (${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"})`}
                value={formatZAR(cart.subtotalCents)}
              />

              <div className="border-t border-dashed border-ink-200 pt-3">
                <SummaryRow
                  label={quote && canShip ? `Delivery (${SHIPPING_METHOD_LABELS[quote.method].toLowerCase()})` : "Delivery"}
                  value={canShip ? formatZAR(shippingCents) : "Calculated at checkout"}
                />
              </div>

              <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
                All products ship with {DELIVERY_COURIER}. Delivery is paid by you, charged separately at checkout. {DELIVERY_ESTIMATE}
              </p>

              <div className="flex items-center justify-between border-t border-ink-200 pt-3">
                <span className="text-base font-bold text-ink-900">Total</span>
                <span className="text-xl font-bold tracking-tight text-ink-900 tabular-nums">
                  {canShip ? formatZAR(totalCents) : "Awaiting shipping"}
                </span>
              </div>

              <p className="text-xs text-ink-500">
                Delivery is charged separately from the item price.{" "}
                <Link href="/shipping" className="font-semibold text-brand-700 hover:underline">
                  How it is calculated
                </Link>
              </p>
            </div>

            <div className="border-t border-ink-100 p-5">
              <Link href="/checkout" className="btn btn-primary btn-lg w-full">Proceed to checkout</Link>
              {!canShip ? <p className="mt-2 text-xs text-ink-600">Enter your delivery address at checkout. You can place an order only after a delivery price is confirmed.</p> : null}

              <p className="mt-3 text-center text-xs text-ink-500">{copy.notAPawnShop}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="font-medium text-ink-900 tabular-nums">{value}</span>
    </div>
  );
}
