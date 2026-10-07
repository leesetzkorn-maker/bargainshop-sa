"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
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
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="heading-section text-2xl text-ink-900">The admin page could not be loaded</h1>
      <p className="mt-3 text-sm text-ink-600">Try again. If it keeps happening, check the server log.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-400">{error.digest}</p> : null}
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/admin" className="btn btn-secondary">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
