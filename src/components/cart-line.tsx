"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { updateCartLineAction, type CartActionState } from "@/app/actions/cart";
import { ConditionBadge } from "@/components/ui";
import { formatZAR } from "@/lib/money";

export function CartLine({
  slug,
  name,
  imageUrl,
  condition,
  unitPriceCents,
  quantity,
  maxQuantity,
  lineTotalCents,
  removeAction,
}: {
  slug: string;
  name: string;
  imageUrl?: string;
  condition: string;
  unitPriceCents: number;
  quantity: number;
  maxQuantity: number;
  lineTotalCents: number;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState<CartActionState, FormData>(
    updateCartLineAction,
    { ok: false },
  );
  const [value, setValue] = useState(quantity);
  const [syncedFrom, setSyncedFrom] = useState(quantity);

  if (syncedFrom !== quantity) {
    setSyncedFrom(quantity);
    setValue(quantity);
  }

  useEffect(() => {
    if (value === quantity) return;
    const timer = setTimeout(() => {
      const formData = new FormData();
      formData.set("slug", slug);
      formData.set("quantity", String(value));
      formAction(formData);
    }, 450);
    return () => clearTimeout(timer);
  }, [value, quantity, slug, formAction]);

  const soldOut = maxQuantity <= 0;
  const options = Array.from(
    { length: Math.max(1, Math.min(maxQuantity, 10)) },
    (_, index) => index + 1,
  );

  return (
    <div className="flex gap-3.5 sm:gap-4">
      <Link
        href={`/product/${slug}`}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-100 sm:h-24 sm:w-24"
      >
        {imageUrl ? <Image src={imageUrl} alt="" fill sizes="96px" className="object-cover" /> : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1">
              <ConditionBadge condition={condition} />
            </div>
            <h3 className="text-sm font-semibold leading-snug text-ink-900">
              <Link href={`/product/${slug}`} className="hover:underline">
                {name}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-ink-500">{formatZAR(unitPriceCents)} each</p>
          </div>

          <p className="shrink-0 text-base font-bold text-ink-900 tabular-nums">
            {formatZAR(lineTotalCents)}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`qty-${slug}`} className="sr-only">
              Quantity for {name}
            </label>
            <select
              id={`qty-${slug}`}
              value={value}
              disabled={pending || soldOut}
              onChange={(event) => setValue(Number(event.target.value))}
              className="input w-auto py-1.5 text-sm"
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  Qty: {n}
                </option>
              ))}
            </select>

            {quantity > 1 ? (
              <span className="text-xs text-ink-500">Only {maxQuantity} in stock</span>
            ) : null}
          </div>

          <form action={removeAction}>
            <input type="hidden" name="slug" value={slug} />
            <button
              type="submit"
              className="text-xs font-semibold text-ink-500 underline-offset-2 hover:text-danger-600 hover:underline"
            >
              Remove
            </button>
          </form>
        </div>

        {state.message && !state.ok ? (
          <p className="text-xs text-danger-600">{state.message}</p>
        ) : null}
      </div>
    </div>
  );
}
