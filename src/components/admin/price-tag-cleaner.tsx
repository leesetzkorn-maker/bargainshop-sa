"use client";

import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import {
  applyCleanedImageAction,
  discardCleanedImageAction,
  removePriceTagAction,
} from "@/app/actions/admin";

/**
 * Admin-only clean-up tool: strips the pawn shop's own price sticker off a
 * product photo using AI.
 *
 * Deliberately a separate component, rendered outside the product form. It must
 * never interfere with saving the listing — the owner's rule is that nothing
 * happens to a photo until they have looked at the result and said yes, and
 * mixing an irreversible-looking AI button into the save form would blur that.
 *
 * The flow is three states, all visible at once:
 *
 *   idle     -> one "Remove price tag with AI" button per photo
 *   review   -> BEFORE next to AFTER, plus Approve and Discard
 *   done     -> a redirect back to the saved product
 *
 * Nothing is submitted to the storefront until Approve, and the original file
 * is never overwritten either way.
 */

/**
 * `useFormStatus` only reports for the form it is rendered inside, so this has
 * to be a child of the <form>. Generation takes tens of seconds; without a
 * pending state the obvious next move is to click the button again.
 */
function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export interface CleanerImage {
  id: string;
  url: string;
  alt: string | null;
}

export function PriceTagCleaner({
  productId,
  images,
  candidate,
  candidateSourceImageId,
}: {
  productId: string;
  images: CleanerImage[];
  /** An unreviewed edit, already verified by the server as still on disk. */
  candidate?: string | null;
  candidateSourceImageId?: string | null;
}) {
  if (images.length === 0) return null;

  const source = candidateSourceImageId
    ? images.find((image) => image.id === candidateSourceImageId)
    : undefined;
  const reviewing = Boolean(candidate && source);

  return (
    <section className="card mt-6 space-y-4 p-5">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">
          Clean up a photo
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Removes the pawn shop&apos;s own price sticker with AI and rebuilds the surface
          underneath it. The product itself is left alone, and your original photo is never
          overwritten — the cleaned version is saved as a separate file for you to approve
          first.
        </p>
      </div>

      {reviewing && source ? (
        <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-4">
          <h3 className="font-bold text-ink-900">Review before it goes live</h3>
          <p className="text-sm text-ink-600">
            Check the product still looks exactly like the item you photographed: same shape,
            colour, logos, model number and framing. Approving replaces the gallery photo. The
            original file stays on disk either way.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <figure>
              <figcaption className="mb-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
                Before
              </figcaption>
              {/* Admin thumbs include SVG placeholders, which next/image will not optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source.url}
                alt={source.alt ?? "Original product photo"}
                className="aspect-square w-full rounded-lg border border-ink-200 bg-white object-contain"
              />
            </figure>
            <figure>
              <figcaption className="mb-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
                After — sticker removed
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={candidate as string}
                alt="Cleaned product photo awaiting approval"
                className="aspect-square w-full rounded-lg border border-brand-300 bg-white object-contain"
              />
            </figure>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={applyCleanedImageAction}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="imageId" value={source.id} />
              <input type="hidden" name="candidate" value={candidate as string} />
              <SubmitButton className="btn btn-primary" pendingLabel="Saving…">
                Approve and use this photo
              </SubmitButton>
            </form>
            <form action={discardCleanedImageAction}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="candidate" value={candidate as string} />
              <SubmitButton className="btn btn-secondary" pendingLabel="Discarding…">
                Discard, keep the original
              </SubmitButton>
            </form>
          </div>
        </div>
      ) : null}

      {reviewing ? null : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image) => (
            <li key={image.id} className="rounded-lg border border-ink-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.alt ?? ""}
                className="aspect-square w-full rounded object-cover"
              />
              <form action={removePriceTagAction} className="mt-2">
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="imageId" value={image.id} />
                {candidate ? (
                  <input type="hidden" name="previousCandidate" value={candidate} />
                ) : null}
                <SubmitButton
                  className="btn btn-secondary btn-sm w-full"
                  pendingLabel="Working…"
                >
                  Remove price tag with AI
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      {!reviewing ? (
        <Alert tone="info">
          One photo at a time, and only where a sticker actually is — this costs a small
          amount per photo, so it is never run in bulk over the catalogue.
        </Alert>
      ) : null}
    </section>
  );
}