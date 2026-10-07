import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-20 text-center sm:py-28">
      <p className="text-sm font-bold uppercase tracking-widest text-brand-700">404</p>
      <h1 className="heading-section mt-3 text-2xl text-ink-900 sm:text-3xl">
        We could not find that page
      </h1>
      <p className="mt-3 text-ink-600">
        The link may be old, or the item may have sold. Most of our stock is one-off, so pages do
        disappear once something sells.
      </p>

      <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
        <Link href="/shop" className="btn btn-primary btn-lg">
          Browse what is in stock
        </Link>
        <Link href="/" className="btn btn-secondary btn-lg">
          Go to the homepage
        </Link>
      </div>
    </div>
  );
}
