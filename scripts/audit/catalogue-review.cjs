// Read-only review: no product, order or configuration is changed.
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs/promises');
const path = require('node:path');
const prisma = new PrismaClient();
async function main() {
  const intake = JSON.parse(await fs.readFile('data/internal/ezpawn-intake.json', 'utf8'));
  const facts = JSON.parse(await fs.readFile('data/internal/shipping-facts.json', 'utf8'));
  const products = await prisma.product.findMany({ orderBy: { itemId: 'asc' }, include: { images: { orderBy: { sortOrder: 'asc' } } } });
  const real = products.filter(p => p.status !== 'ARCHIVED' && p.images.some(im => im.url.startsWith('/uploads/products/')));
  const rows = [];
  for (const p of real) {
    const d = intake.drafts.find(d => d.itemId === p.itemId) || {};
    const f = facts.items.find(f => f.itemId === p.itemId);
    const issues = [];
    if (!d.itemId) issues.push('Product missing from intake ledger');
    if (!p.priceCents) issues.push('Selling price missing');
    if (d.sellingPriceCents > 0 && p.priceCents !== d.sellingPriceCents) issues.push('Price differs from intake');
    if (p.stockQty !== 1) issues.push('Stock quantity needs confirmation');
    if (p.testingStatus === 'TESTED_AND_WORKING') issues.push('Confirm physical testing: import scripts assign this automatically');
    if (/icloud locked/i.test(d.costNote || '')) issues.push('Intake says iCloud locked; confirm lock and sale condition');
    if (f?.basis === 'OWNER_WEIGHED' && /estimate/i.test(d.weightNote || '')) issues.push('Measurement provenance conflict: OWNER_WEIGHED versus intake estimate');
    if (p.measurementSource === 'ESTIMATED') issues.push('Packed weight and dimensions estimated; measure before confirming delivery');
    const missingImages = [];
    for (const im of p.images) {
      try { await fs.access(path.join(process.cwd(), 'public', im.url)); }
      catch { missingImages.push(im.url); }
    }
    if (missingImages.length) issues.push('Image files missing');
    rows.push({ itemId: p.itemId, name: p.name, status: p.status, priceRands: p.priceCents / 100, intakePriceRands: (d.sellingPriceCents || 0) / 100, stockQty: p.stockQty, testingStatus: p.testingStatus, measurementSource: p.measurementSource, packedGrams: p.productWeightGrams + p.packageWeightGrams, boxCm: [p.packageLengthCm,p.packageWidthCm,p.packageHeightCm], description: p.description, conditionNote: p.conditionNote, images: p.images.map(im => ({ imageId: im.id, url: im.url })), missingImages, issues });
  }
  const shipping = await prisma.shippingSetting.findUnique({ where: { id: 1 } });
  const envText = await fs.readFile('.env', 'utf8').catch(()=>'');
  const configuration = {};
  for (const key of ['NEXT_PUBLIC_BRAND_NAME','NEXT_PUBLIC_BRAND_URL','NEXT_PUBLIC_CONTACT_EMAIL','NEXT_PUBLIC_CONTACT_PHONE','NEXT_PUBLIC_WHATSAPP_NUMBER','NEXT_PUBLIC_LEGAL_COMPANY_NAME','NEXT_PUBLIC_LEGAL_ADDRESS','PAYMENT_PROVIDER','COURIER_PROVIDER','STORAGE_DRIVER','PAYFAST_LIVE_ID','PAYFAST_LIVE_PASS','PAYFAST_PASSPHRASE','AUTH_SECRET','CART_SECRET']) {
    const line = envText.split(/\r?\n/).find(l=>l.startsWith(key+'='));
    const value = line ? line.slice(key.length+1).trim().replace(/^['"]|['"]$/g,'') : '';
    configuration[key] = !value ? 'EMPTY' : /CHANGEME|example\.com/.test(value) ? 'PLACEHOLDER' : key==='NEXT_PUBLIC_BRAND_URL' && /localhost/.test(value) ? 'LOCALHOST' : ['PAYMENT_PROVIDER','COURIER_PROVIDER','STORAGE_DRIVER'].includes(key) ? value : 'SET (value hidden)';
  }
  const report = { reviewedAt: new Date().toISOString(), realProducts: rows.length, realPhotos: rows.reduce((n,p) => n+p.images.length,0), exampleProducts: products.filter(p=>p.images.length && p.images.every(im=>im.url.startsWith('/placeholder/'))).length, archivedPhotographedProducts: products.filter(p=>p.status==='ARCHIVED' && p.images.some(im=>im.url.startsWith('/uploads/products/'))).map(p=>p.itemId), missingPrices: rows.filter(p=>!p.priceRands).map(p=>({itemId:p.itemId,name:p.name})), configuration, shipping, products:rows };
  await fs.writeFile('data/internal/catalogue-review.json', JSON.stringify(report,null,2)+'\n');
  const lines = ['# Catalogue review', '', 'Read-only audit. No stock or prices changed. Private operational report.', '', `Real products: ${report.realProducts}; photos: ${report.realPhotos}; example products: ${report.exampleProducts}.`, '', '## Missing selling prices', '', ...report.missingPrices.map(p=>`- ${p.itemId}: ${p.name}`), '', '## Confirmation required', '', '- Confirm actual possession, quantity, included accessories and physical testing for all real items. Import scripts automatically assign tested status; this is not testing evidence.', '- Confirm iCloud lock status of 2DS-0047. It must not be described as an unrestricted working iPad without evidence.', '- Resolve OWNER_WEIGHED versus estimated intake weights; confirm packed outer dimensions separately.', '- Confirm courier, actual rate card, dispatch address/postcode, delivery areas and free shipping policy. Current dispatch postcode is 0000.', '- Review example products and demo order history before launch; do not run the destructive go-live script blindly.', '- Approve sample image edits before the remaining batch and database image replacement.', '', '## Product review', '', '| Item | Product | Selling price (R) | Stock | Measurements | Issues |', '| --- | --- | ---: | ---: | --- | --- |', ...rows.map(p=>`| ${p.itemId} | ${p.name.replaceAll('|','/')} | ${p.priceRands.toFixed(2)} | ${p.stockQty} | ${p.measurementSource} | ${p.issues.join('; ')} |`)];
  await fs.writeFile('data/internal/catalogue-review.md', lines.join('\n')+'\n');
  const descriptions = ['# Product descriptions for owner review', '', 'All products below remain in draft pending photo review, physical checks and delivery-rate confirmation.', '', ...rows.flatMap(p=>[`## ${p.itemId} — ${p.name}`, '', `Selling price: ${p.priceRands ? 'R'+p.priceRands.toFixed(2) : 'Awaiting confirmed acquisition cost'}`, '', p.description, ''])];
  await fs.writeFile('data/internal/product-descriptions.md', descriptions.join('\n')+'\n');
  console.log('Configuration status (values redacted)', configuration);
  console.log(JSON.stringify({realProducts:report.realProducts,realPhotos:report.realPhotos,exampleProducts:report.exampleProducts,missingPrices:report.missingPrices,measurementConflicts:rows.filter(p=>p.issues.some(i=>i.startsWith('Measurement provenance'))).map(p=>p.itemId),priceConflicts:rows.filter(p=>p.issues.includes('Price differs from intake')).map(p=>p.itemId),missingImageFiles:rows.flatMap(p=>p.missingImages)},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
