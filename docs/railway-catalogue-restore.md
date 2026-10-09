# Restore the existing real catalogue without replacing production data

The local recovery source is `prisma/dev.db`, not a seed script. The complete
private backup and staged bundle are under
`backups/railway-restore-20261008T224438Z/`. This directory is ignored by Git.

Local counts: 97 products, 19 categories, 223 product-image rows and 8 orders.
The transfer contains only 52 current real products, 19 categories, 90 listing
photos and 202 private original/mask files. Archived demos and the duplicate
archived item are excluded. Local orders, customers, accounts, secrets and
payment/shipping settings are never imported.

Two real products are ACTIVE. Fifty remain DRAFT with their existing review
requirements. Restoring data does not publish those drafts automatically.

## Existing Railway account and service

Sign into the existing account using `npx --yes @railway/cli login`, then link
the **existing** observant-blessing project and **bargainshop-sa** service. Do not create
a project, service, database or volume. Confirm the selected project/service
with the CLI before any upload or SSH command.

Check only these storage variables, without printing all service secrets:

```text
DATABASE_URL=file:/data/prod.db
UPLOADS_DIR=/data/uploads
DATA_DIR=/data/private
```

Confirm the existing volume is mounted at `/data`. Inspect the existing
database row counts over Railway SSH and make a consistent SQLite backup
with SQLite's backup facility or `VACUUM INTO`, not by copying a live main
database file without its WAL contents. Back up existing production photo
directories to a new private backup directory too. Download that backup for
independent recovery. Do not replace `/data/prod.db` with the local database.

## Add-only merge

Stage the bundle in a new private application directory, for example
`/app/restoration-verified-20261009`, outside the 500 MB persistent volume.
The bundle and final assets together would otherwise consume too much volume
space. Transfer only the bundle, never `local-catalogue.db` or SSH keys. Verify
the archive checksum before extracting into a new empty directory. Do not
overwrite existing files or stage under public assets.

The bundle includes `merge-catalogue.cjs`, `catalogue.json`, `manifest.json` and
the checked public/private assets. From the application's working directory
(normally `/app`), execute this on the existing Railway service:

```sh
node /app/restoration-verified-20261009/merge-catalogue.cjs \
  --bundle /app/restoration-verified-20261009 \
  --database file:/data/prod.db --volume-root /data
```

This is a dry run. Record the production counts and resolve any identifier,
record or file-hash conflicts. Existing records are never overwritten. If the
same product has changed in production (for example stock is sold or its price
was edited), it requires review rather than overwriting it with local data.

Only after the checks succeed, repeat with `--apply`. It creates an additional
consistent database/asset backup in `/data/backups/restore-<timestamp>` before
adding missing files and transactionally inserting missing records. It never
resets a database, deletes rows, overwrites files, changes existing product
prices, or imports local orders/settings. Repeated application is idempotent.

Verify production product/category/image/order counts, the unchanged existing
orders/settings, all imported image hashes and the public `/shop`, `/product`
and `/uploads/products` routes. Check published listings against the saved
local prices. Retain every backup and the dry-run/applied reports.

CLI references: [existing project linking](https://docs.railway.com/cli/link),
[service file transfers](https://docs.railway.com/cli/service),
[Railway SSH](https://docs.railway.com/cli/ssh).
