/** Add-only restore. Run on the existing service after staging the private bundle.
 * Dry run by default. Never replaces a database, updates existing products,
 * imports customers/orders/settings, publishes drafts, or overwrites a file.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { PrismaClient } = createRequire(path.join(process.cwd(), 'package.json'))('@prisma/client');
const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return args[index + 1];
};
const bundle = path.resolve(flag('--bundle') || '.');
const volume = path.resolve(flag('--volume-root') || '/data');
const databaseUrl = flag('--database') || process.env.DATABASE_URL;
const apply = args.includes('--apply');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const counts = async db => ({ products: await db.product.count(), categories: await db.category.count(), images: await db.productImage.count(), orders: await db.order.count() });
function within(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Unsafe asset path.');
  const out = path.resolve(root, relative);
  if (!out.startsWith(root + path.sep)) throw new Error('Asset path escapes root.');
  return out;
}
function productFields(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['id', 'createdAt', 'updatedAt'].includes(key)));
}
function differences(left, right) {
  return Object.keys(left).filter(key => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}
async function immutableRows(db) {
  const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('Product','Category','ProductImage') ORDER BY name");
  const result = {};
  for (const { name } of tables) {
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "${name.replaceAll('"', '""')}"`);
    result[name] = rows.map(row => JSON.stringify(row, (_, v) => typeof v === 'bigint' ? v.toString() : v)).sort();
  }
  return result;
}

async function main() {
  if (!args.includes('--bundle') || !databaseUrl?.startsWith('file:')) throw new Error('Supply --bundle and an existing SQLite --database URL.');
  const database = path.resolve(databaseUrl.slice(5));
  if (!database.startsWith(volume + path.sep) || !fs.existsSync(database)) throw new Error('Existing production database must be present on the specified volume; no replacement will be created.');
  if (process.env.RAILWAY_SERVICE_NAME && process.env.RAILWAY_SERVICE_NAME !== 'bargainshop-sa') throw new Error('Wrong Railway service; no restore performed.');
  if (process.env.RAILWAY_SERVICE_ID && databaseUrl !== 'file:/data/prod.db') throw new Error('Railway restore must target file:/data/prod.db.');
  const dataBytes = fs.readFileSync(path.join(bundle, 'catalogue.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  if (sha(dataBytes) !== manifest.catalogueSha256) throw new Error('Catalogue checksum mismatch.');
  const data = JSON.parse(dataBytes);
  if (new Set(data.products.map(p => p.itemId)).size !== data.products.length) throw new Error('Duplicate input item IDs.');
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const before = await counts(db), protectedBefore = await immutableRows(db);
    const categories = await db.category.findMany(), products = await db.product.findMany(), images = await db.productImage.findMany();
    const plan = { mode: apply ? 'apply' : 'dry-run', before, categoriesToAdd: [], productsToAdd: [], imagesToAdd: [], filesToAdd: [], existingProductsPreserved: [], conflicts: [] };
    const categoryMap = new Map();
    let waiting = [...data.categories];
    while (waiting.length) {
      const next = [];
      for (const c of waiting) {
        if (c.parentId && !categoryMap.has(c.parentId)) { next.push(c); continue; }
        const match = categories.find(existing => existing.slug === c.slug);
        if (match) categoryMap.set(c.id, match.id);
        else if (categories.some(existing => existing.id === c.id)) plan.conflicts.push({ category: c.slug, reason: 'Category ID collision' });
        else { const row = { ...c, parentId: c.parentId ? categoryMap.get(c.parentId) : null }; categoryMap.set(c.id, c.id); plan.categoriesToAdd.push(row); }
      }
      if (next.length === waiting.length) throw new Error('Unresolved category ancestry or collision.');
      waiting = next;
    }
    const productMap = new Map();
    for (const p of data.products) {
      const matches = products.filter(existing => existing.id === p.id || existing.itemId === p.itemId || existing.slug === p.slug || existing.sku === p.sku);
      const proposed = { ...p, categoryId: categoryMap.get(p.categoryId) };
      if (!proposed.categoryId) throw new Error(`Missing category for ${p.itemId}.`);
      if (!matches.length) { plan.productsToAdd.push(proposed); productMap.set(p.id, p.id); }
      else if (matches.length === 1 && matches[0].itemId === p.itemId) {
        const fields = differences(productFields(proposed), productFields(matches[0]));
        if (fields.length) plan.conflicts.push({ itemId: p.itemId, reason: 'Existing product differs; never overwritten', fields });
        else { productMap.set(p.id, matches[0].id); plan.existingProductsPreserved.push(p.itemId); }
      } else plan.conflicts.push({ itemId: p.itemId, reason: 'Product identifier collision' });
    }
    for (const image of data.images) {
      const productId = productMap.get(image.productId);
      if (!productId) continue;
      const same = images.find(existing => existing.productId === productId && existing.url === image.url);
      if (same) continue;
      if (images.some(existing => existing.id === image.id)) plan.conflicts.push({ imageId: image.id, reason: 'Image ID collision' });
      else plan.imagesToAdd.push({ ...image, productId });
    }
    for (const asset of manifest.assets) {
      if (!asset.target.startsWith('uploads/products/') && !asset.target.startsWith('private/')) throw new Error('Unsupported asset destination.');
      const input = within(bundle, asset.input), output = within(volume, asset.target);
      if (sha(fs.readFileSync(input)) !== asset.sha256) throw new Error(`Staged file checksum mismatch: ${asset.input}`);
      if (fs.existsSync(output)) {
        if (sha(fs.readFileSync(output)) !== asset.sha256) plan.conflicts.push({ file: asset.target, reason: 'Existing file differs; never overwritten' });
      } else plan.filesToAdd.push(asset);
    }
    for (const image of data.images) {
      const target = image.url.replace(/^\//, '');
      if (!manifest.assets.some(a => a.target === target)) throw new Error(`Missing public photo in bundle: ${image.id}`);
    }
    const summary = { ...plan, categoriesToAdd: plan.categoriesToAdd.length, productsToAdd: plan.productsToAdd.map(p => ({ itemId: p.itemId, status: p.status })), imagesToAdd: plan.imagesToAdd.length, filesToAdd: plan.filesToAdd.length };
    console.log(JSON.stringify(summary, null, 2)); // No private cost/customer data.
    if (!apply) return;
    if (plan.conflicts.length) throw new Error('Restore blocked by conflicts. No production data or files changed.');
    if (!plan.productsToAdd.length && !plan.imagesToAdd.length && !plan.categoriesToAdd.length && !plan.filesToAdd.length) { console.log('Already restored; nothing changed.'); return; }
    const backup = path.join(volume, 'backups', `restore-${Date.now()}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.mkdirSync(backup); // Fail rather than reuse/overwrite a previous backup.
    await db.$executeRawUnsafe(`VACUUM INTO '${path.join(backup, 'prod-before.db').replaceAll("'", "''")}'`);
    for (const folder of ['uploads', 'private']) if (fs.existsSync(path.join(volume, folder))) fs.cpSync(path.join(volume, folder), path.join(backup, folder), { recursive: true, errorOnExist: true, force: false });
    fs.writeFileSync(path.join(backup, 'restore-plan.json'), JSON.stringify(summary, null, 2));
    for (const asset of plan.filesToAdd) {
      const output = within(volume, asset.target);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      if (!fs.realpathSync(path.dirname(output)).startsWith(fs.realpathSync(volume) + path.sep)) throw new Error('Asset directory resolves outside the volume.');
      fs.copyFileSync(within(bundle, asset.input), output, fs.constants.COPYFILE_EXCL);
      if (sha(fs.readFileSync(output)) !== asset.sha256) throw new Error('Copied file checksum mismatch; database not changed.');
    }
    await db.$transaction(async tx => {
      for (const row of plan.categoriesToAdd) await tx.category.create({ data: row });
      for (const row of plan.productsToAdd) await tx.product.create({ data: row });
      for (const row of plan.imagesToAdd) await tx.productImage.create({ data: row });
    }, { timeout: 60000 });
    const protectedAfter = await immutableRows(db);
    if (JSON.stringify(protectedAfter) !== JSON.stringify(protectedBefore)) throw new Error('Protected records changed during restore. No rollback/reset attempted; inspect the preserved backup and concurrent activity.');
    console.log(JSON.stringify({ result: 'restored', backup, after: await counts(db), filesTransferred: plan.filesToAdd.length, ordersAndSettingsUnchanged: true }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
