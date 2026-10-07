# 2de Store

South African online shop for second-hand goods the business has already sourced. Customers buy and receive delivery. They do not pawn items, take loans, or sell goods to the store through this site.

The trading name is a placeholder (`2de Store`) until a final brand is chosen. Change it with `NEXT_PUBLIC_BRAND_NAME`. Do not invent payment credentials, courier credentials, or company registration details.

## What is included

- Storefront: home, shop, categories, product pages, cart, checkout, order confirmation, and the information pages (about, contact, shipping, returns, privacy, terms).
- One-of-a-kind stock: quantity `1` by default, and a product is marked sold out when stock hits zero. Order history is kept.
- The Courier Guy delivery uses confirmed editable tariffs, chargeable weight and parcel eligibility. Shipping is a separate customer-paid checkout line. Quotes stay closed until account tariffs and dispatch details are confirmed.
- Offline payment: the order is created and an admin marks it paid. No PayFast, iKhokha, or GoTyme module is wired up yet.
- Manual courier tracking: an admin types the tracking number. No courier API is called.
- Private admin area for products, categories, orders, customers, shipping rules, and profit. Source cost, supplier notes, and admin notes are not shown on the store.

## Requirements

- Node.js 20 or newer
- npm

The database is SQLite by default (`prisma/dev.db`). PostgreSQL can be used later by changing the Prisma datasource and `DATABASE_URL`.

## Setup

```bash
npm install
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env`.

Then set real values in `.env` before anyone else can sign in:

- `AUTH_SECRET` and `CART_SECRET`: long random strings (`openssl rand -base64 32`)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
- Contact and brand values when you know them

Leave payment and courier secrets blank. `PAYMENT_PROVIDER=offline` and `COURIER_PROVIDER=manual` are the supported modes in this build.

```bash
npm run setup
npm run dev
```

Open the store at [http://localhost:3000](http://localhost:3000) and the admin at [http://localhost:3000/admin](http://localhost:3000/admin).

`npm run setup` generates the Prisma client, applies migrations, and seeds categories, initial settings and the admin user. No products or courier prices are invented. If the admin user already exists, the password is left unchanged. Set `ADMIN_PASSWORD` before the first seed.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm test` | Money and shipping unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:seed` | Seed again |
| `npm run db:studio` | Browse the database |

## Deploying

Any host with a persistent disk can use the local image store (`STORAGE_DRIVER=local`, files in `public/uploads`). Serverless hosts forget those files on each deploy, so move uploads to object storage before going live there.

Set `NEXT_PUBLIC_BRAND_URL` to the public `https` origin. Rotate `AUTH_SECRET` only when you want to sign every admin out.

Legal pages show a warning until the company name, registration number, and address environment variables are filled in with real values and reviewed. Do not publish invented legal details.

## Still to connect later

- The real payment gateway, after the business account exists. Add a provider under `src/lib/payments/providers` and set `PAYMENT_PROVIDER`.
- The real courier, the same way, under `src/lib/courier/providers`.
- Final brand name, domain, and logo.


## Launch work ? 7 October 2026

See `data/internal/launch-catalogue.md` for current overlapping readiness flags and `data/internal/launch-readiness.md` for launch inputs still needed. The catalogue remains in draft until verified.

- Admin ? Pricing: handling/sourcing, packaging, minimum Rand profit, markup bands, minimum estimated margin, payment fee assumptions and rounding. Recommendations do not silently override final prices.
- Admin ? Shipping: enter confirmed customer-payable tariffs, limits, dispatch postcode and the volumetric divisor for the chosen courier service. Confirm tariffs before enabling quotes. Live ShipLogic rates and booking are not integrated yet; current rates and tracking are manual.
- Product editing: sourced brand/model, actual-item review, image reuse evidence, measured parcel data and per-item shipping eligibility. Original files are retained; existing edited galleries now also include recorded pre-edit photos.
- `npm run catalogue:audit` writes a private catalogue report. `npx tsx scripts/launch-catalogue.ts --apply` applies sourced descriptions and restores recorded original gallery photos; it never publishes or changes final prices.
- `npm run catalogue:import -- <grok.json>` reviews Grok's structured handoff; `--apply` updates existing drafts. See `data/internal/grok-intake-format.md`. It does not reanalyse photographs or generate images.
- Production checkout needs a configured live payment provider. Manual payment additionally requires real `OFFLINE_PAYMENT_INSTRUCTIONS`; an empty gateway configuration cannot open live checkout.
- `npm test` includes an isolated database checkout race and shipping-total check. It never places a real order or sends email.

The Courier Guy's published guidance distinguishes ECO 4000 and OVN 5000 volumetric factors: https://thecourierguy.co.za/pdf/TheCourierGuy-OneRate.pdf . Confirm the current factor and service limits for this account instead of assuming either applies.


## Independent store systems verification

See `data/internal/system-readiness-20261007.md`. Run `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, then `npm run test:e2e`. Browser regression uses installed Chrome and an isolated database copy on port 3108; it never publishes or orders from the owner's database. Its generated artifacts are ignored by Git.

Admin drafts now default to quantity 1 and Draft status, can auto-create a factual description, accept multiple photos, let the owner choose a main image, and provide explicit Save draft / Publish controls. Manual price overrides are preserved, including the six R799 helmets. Shipping destination coverage is edited as province codes and postcode prefixes on each temporary tariff. Unknown delivery charges are displayed as pending and cannot be treated as zero-cost delivery.

Peach configuration is prepared but disabled until the approved Checkout API and its credentials/notifications are verified; see `data/internal/peach-payments-setup.md`. No live deployment was made.
