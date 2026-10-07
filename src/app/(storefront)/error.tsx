"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex max-w-xl flex-col items-center py-20 text-center sm:py-28">
      <p className="text-sm font-bold uppercase tracking-widest text-danger-600">
        Something went wrong
      </p>
      <h1 className="heading-section mt-3 text-2xl text-ink-900 sm:text-3xl">
        This page could not be loaded
      </h1>
      <p className="mt-3 text-ink-600">
        That is on us, not on you. Try again, and if it keeps happening, tell us and we will look into
        it properly.
      </p>

      {error.digest ? (
        <p className="mt-3 text-xs text-ink-400">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
        <button type="button" onClick={reset} className="btn btn-primary btn-lg">
          Try again
        </button>
        <Link href="/shop" className="btn btn-secondary btn-lg">
          Browse the shop
        </Link>
      </div>
    </div>
  );
}
