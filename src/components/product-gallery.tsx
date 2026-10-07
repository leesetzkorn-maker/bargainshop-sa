"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  name,
  soldOut,
}: {
  images: Array<{ id: string; url: string; alt: string | null }>;
  name: string;
  soldOut: boolean;
}) {
  const [active, setActive] = useState(0);
  const current = images[active];
  const photo = current?.url.startsWith("/uploads/") ?? false;

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-ink-100 text-sm text-ink-400">
        No photo available for this item
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-ink-200 bg-white">
        {current ? (
          <Image
            key={current.id}
            src={current.url}
            alt={current.alt ?? name}
            fill
            sizes="(max-width: 1024px) 100vw, 40rem"
            className={cn(photo ? "object-contain p-3" : "object-cover", soldOut && "opacity-60 grayscale")}
            preload
          />
        ) : null}
        {soldOut ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="badge badge-danger bg-white/90 px-3 py-1.5 text-sm">Sold out</span>
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label="Product images">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              aria-current={index === active}
              className={cn(
                "relative aspect-square w-full overflow-hidden rounded-lg border-2 bg-ink-100 transition-colors",
                index === active
                  ? "border-brand-600"
                  : "border-ink-200 hover:border-ink-400",
              )}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
