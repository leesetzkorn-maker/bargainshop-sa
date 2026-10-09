# Existing 2DE BARGAINS Railway service

Use the existing **2DE BARGAINS** project and **bargainshop-sa** service. Do not create a new service/database or change DNS or payments.

## Required service settings

1. Attach the existing persistent volume to this service at **`/data`**. Keep one replica in one region. Do not delete/recreate the volume.
2. Set service variables (plain values, without surrounding quotes):

   ```text
   DATABASE_URL=file:/data/prod.db
   UPLOADS_DIR=/data/uploads
   DATA_DIR=/data/private
   NODE_ENV=production
   ```

   Keep existing `AUTH_SECRET`, `CART_SECRET`, payment credentials, domains and all other business settings. Railway supplies `PORT` and `RAILWAY_VOLUME_MOUNT_PATH`; do not invent these. If authentication/cart secrets are absent, add persistent private secrets before redeploying. Do not rotate existing ones.
3. Build command: **`npm run build`**. Start command: **`npm start`**. Remove any old direct Prisma/Next start override and any pre-deploy migration/seed command. Migrations run at startup, when the volume is mounted.
4. Healthcheck: **`/api/health`**, timeout **300 seconds**. Restart policy **On Failure**, maximum **3 retries**. `railway.json` supplies these deployment settings, including an empty pre-deploy command.
5. Connected repository: `leesetzkorn-maker/bargainshop-sa`, branch `master`, root `/`. Use the existing connection; no new project is necessary.

## Preserve the actual database before changing a path

Check the existing volume's files before redeploying. `/data/prod.db` must be the existing populated store database, with its Prisma migration history. Startup intentionally refuses to create an empty replacement if it is missing.

If the current database has a different filename/location, take a consistent SQLite backup from that database and restore that backup to `/data/prod.db` only while the service is stopped and only if the destination is absent. Retain the old file and volume backup. Never overwrite an existing `prod.db`, run `db:reset`, or use `db push --accept-data-loss`. Do not copy a live SQLite main file without its WAL contents; use SQLite's backup facility or `VACUUM INTO`.

If no populated database has ever reached Railway, transfer the existing store database and its related photo/private files to the **same existing volume**. The database and uploads are ignored by Git and therefore are not delivered by a GitHub push. This is a restore of existing data, not seeding a new catalogue. Keep the original source and backups.

Preserve the existing public photo keys under `/data/uploads/products`; originals and mask bases belong under `/data/private`. Existing customer photo URLs remain unchanged. Do not replace current volume files with repository samples.

If an existing database has no Prisma migration history, stop and baseline it against its actual schema after review. Never mark unverified migrations applied or reset it. Failed migrations also require reviewed recovery from the preserved backup.

## Startup behavior

- The wrapper loads server environment variables before Prisma. On Railway, a missing `DATABASE_URL` defaults to `file:/data/prod.db`; an incorrect explicit path is rejected rather than silently switching data stores.
- Runtime verifies the volume mount, existing database, writable storage, integrity, migration history and required server secrets.
- Pending migrations receive a consistent SQLite backup in `/data/backups` before `prisma migrate deploy`. No backup is written on ordinary restarts with no pending migrations. Backups are never automatically deleted.
- The seed creates missing categories/settings only. It never creates products, modifies existing settings, deletes orders, changes prices, or resets existing admin credentials. Admin creation is only attempted when no owner exists and explicitly supplied valid bootstrap credentials are present.
- Next binds to `0.0.0.0:$PORT`. Health returns 200 only when the product table is readable and never reveals database paths or credentials.
- Build only generates Prisma Client and compiles Next. It never migrates, seeds, or accesses the volume. Sitemap generation runs at request time.

Check deployment logs for `Persistent SQLite ready: /data/prod.db`, then `/api/health`, `/shop` and admin login. A local build cannot verify a Railway volume or service variables; these must be checked on this existing service.

References: [Railway volumes](https://docs.railway.com/volumes), [Railway variables](https://docs.railway.com/variables/reference), [Railway deployment configuration](https://docs.railway.com/config-as-code/reference).
