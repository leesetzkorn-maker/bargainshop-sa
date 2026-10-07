"use client";

import { useActionState, useEffect, useRef } from "react";
import { addToCartAction, type CartActionState } from "@/app/actions/cart";
import { Alert, StockBadge } from "@/components/ui";

/**
 * Add to cart / Buy now.
 *
 * Uses useActionState so a failed submission re-renders with the message rather
 * than navigating away. `buyNow` swaps the cart for this single item.
 */
export function AddToCartPanel({
  slug,
  stockQty,
  status,
}: {
  slug: string;
  stockQty: number;
  status: string;
}) {
  const [state, formAction, pending] = useActionState<CartActionState, FormData>(
    addToCartAction,
    { ok: false },
  );

  const addedRef = useRef<HTMLParagraphElement>(null);
  const soldOut = status === "SOLD_OUT" || stockQty <= 0;

  useEffect(() => {
    if (state.ok) addedRef.current?.focus();
  }, [state.ok]);

  return (
    <div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="flex items-center gap-2">
            <label htmlFor="quantity" className="sr-only">
              Quantity
            </label>
            <select
              id="quantity"
              name="quantity"
              defaultValue="1"
              disabled={soldOut || stockQty === 1}
              className="input w-auto py-3"
            >
              {Array.from({ length: Math.max(1, Math.min(stockQty, 10)) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={pending || soldOut} className="btn btn-primary btn-lg flex-1">
            {pending ? "Adding…" : soldOut ? "Sold out" : "Add to cart"}
          </button>
        </div>

        <button
          type="submit"
          name="buyNow"
          value="1"
          disabled={pending || soldOut}
          className="btn btn-accent btn-lg w-full"
        >
          {pending ? "Working…" : "Buy now"}
        </button>
      </form>

      <p
        ref={addedRef}
        tabIndex={-1}
        aria-live="polite"
        className="mt-3 focus:outline-none"
      >
        {state.ok && state.message ? (
          <Alert tone="success" className="text-sm">
            {state.message}{" "}
            <a href="/cart" className="font-semibold underline">
              View cart
            </a>
          </Alert>
        ) : null}
        {!state.ok && state.message ? (
          <Alert tone="danger" className="text-sm">
            {state.message}
          </Alert>
        ) : null}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StockBadge stockQty={stockQty} status={status} />
        {stockQty === 1 && !soldOut ? (
          <span className="text-xs text-ink-500">
            This is a one-off item — once it is gone, it is gone.
          </span>
        ) : null}
      </div>
    </div>
  );
}
