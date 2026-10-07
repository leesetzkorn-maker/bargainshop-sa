# Launch readiness ? 7 October 2026

The store is not yet ready to accept live customer orders. No questionable matches were published.

## Catalogue

| Flag | Count |
| --- | ---: |
| TOTAL PRODUCTS | 52 |
| READY | 0 |
| NEEDS REVIEW | 52 |
| NEEDS IMAGE | 43 |
| NEEDS SPECS | 50 |
| NEEDS PRICE | 11 |

Flags overlap. The 44 archived demo products are excluded. All actual-item photos remain; 11 recorded pre-edit photos were restored alongside edited gallery images. Nine manufacturer entries were researched. Redmi A3x and PULSE 3D now have sourced specifications; physical-item review is still outstanding. Other source matches retain missing-spec flags where dimensions, weight, configuration or compatibility remain unverified. Nine existing authorized edits of owner-supplied photos were recognized without generating replacements. Clean manufacturer assets without reuse permission were not adopted. No new image-generation credits were used.

See `launch-catalogue.md` for each product's flags, `launch-catalogue.json` for private pricing recommendations and issues, and `manufacturer-research.json` for manufacturer evidence and rejected near-matches.

## Implemented

- Allowance-aware recommendations, editable sourcing/handling, packaging, minimum profit, markup bands, estimated payment fees, minimum margin and rounding. Existing final selling prices are preserved.
- Product editor shows cost, allowances, recommendation, profit and margin; final price remains editable. All internal costs and research notes stay in admin.
- Saved temporary Courier Guy tariffs replace the hard-coded R100 charge. Unconfirmed tariffs cannot quote. Service volumetric factor and locker limits are editable; per-item service exclusions are respected.
- Locker/pickup-point delivery appears only for qualifying parcels and configured services; checkout requires the chosen pickup-point reference. Door-to-door remains available where configured.
- Product subtotal, shipping and total are calculated on the server. Stale prices or changed delivery methods require checkout review.
- Stock reservation is atomic. The isolated-database regression confirms two customers cannot purchase the same last item and that shipping is added to the total.
- Publication requires model/source evidence, specs review, actual-item/stock/accessory confirmation, image provenance, source cost and measured parcel data.
- Original photo files are retained when galleries are edited. Applying an AI candidate keeps the original gallery row. Existing reconstructed price-label areas are disclosed in image alt text.
- Production checkout stays closed without a configured live payment method; manual payments require actual payment instructions. Empty or unknown gateway configurations cannot silently open live checkout.
- Grok handoff importer creates descriptions from structured observations without duplicating image analysis. It rejects conflicting owner costs and retains photos and final prices.

## Inputs still needed

1. Grok's complete structured output with original filenames, exact visible models and confidence. See `grok-intake-format.md`; send the existing output rather than analysing photos again.
2. Confirmed acquisition costs for 0056, 0059, 0061, 0065, 0070, 0075, 0079, 0089, 0097, 0082 and 0083.
3. Actual possession, stock, cosmetic condition, damage, accessories, locks and functional test results. The iPad remains flagged as iCloud locked.
4. Measured packed weights and outside carton dimensions. Old intake estimates do not become verified manufacturer dimensions or measured parcel facts.
5. Exact-model clean image reuse permission or accepted owned edits, retaining original condition photos. Review visible price tags before publication to avoid disclosing internal sourcing prices.
6. Dispatch address/postcode, Courier Guy account/service coverage, confirmed current customer-payable tariffs, volumetric factor and locker limits. ShipLogic live rates and automated booking are not integrated; temporary tariffs and tracking are manual.
7. Real business/legal/contact details, chosen production host/domain, durable image/database storage, email delivery settings, and PayFast credentials or manual payment instructions.
8. A complete checkout/payment/dispatch test on the final deployment before opening sales. Local regression tests do not prove a live gateway, courier account or hosting environment works.

Backups are under `data/internal/backups/` and `backups/launch-20261007/`. No orders or original photos were deleted.

## Verification

- 75 automated tests passed, including last-item concurrency, customer-paid shipping, stale-quote rejection, allowance/margin pricing, parcel validation and publication gates.
- Production HTTP checks passed for home, shop, shipping, cart and login; admin redirected to login, unpublished product URLs returned 404 and an invalid shipping method returned 400. No private cost/research fields appeared in the checked public responses.
- Type checking passed. Lint reported no errors and two existing unused-symbol warnings.
- Final production build passed after the review-label update. The temporary local smoke server was stopped.
