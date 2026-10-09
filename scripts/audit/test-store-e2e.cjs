/** Real UI/DB regression in an isolated SQLite copy. Never publishes or orders from the owner's database. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { chromium, expect } = require('@playwright/test');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), '2de-ui-test-'));
  const database = path.join(directory, 'test.sqlite');
  await fs.copyFile(path.resolve('prisma/dev.db'), database);
  const db = new PrismaClient({ datasourceUrl: `file:${database.replace(/\\/g,'/')}` });
  let browser, server, debugPage;
  const report = { checkedAt: new Date().toISOString(), checks: [], viewports: [], errors: [] };
  const artifacts = path.resolve('test-artifacts'); await fs.mkdir(artifacts, { recursive: true });
  const ownedUploads = [];
  const pass = (check) => { report.checks.push(check); console.log('PASS '+check); };
  try {
    await db.user.create({ data: { email: 'ui-test@example.invalid', name: 'UI Test Owner', passwordHash: await bcrypt.hash('Test-only-password-123!', 10), role: 'OWNER' } });
    await db.shippingSetting.update({ where: { id: 1 }, data: { isActive: true, ratesConfirmed: true, doorFuelSurchargePercent: 0, dispatchPostalCode: '2000', dispatchProvince: 'GP', dispatchCity: 'Johannesburg', etaMinDays: 1, etaMaxDays: 3 } });
    await db.shippingTier.deleteMany({});
    await db.shippingTier.createMany({ data: [
      { code: 'QA', name: 'QA test size', sortOrder: 10, maxLengthCm: 100, maxWidthCm: 100, maxHeightCm: 100, maxWeightGrams: 100000, lockerToLockerCents: 9900, lockerToDoorCents: 14900, lockerToKioskCents: 8900, kioskToDoorCents: 19900 },
    ] });
    const demo = await db.product.findFirst({where:{images:{every:{url:{startsWith:'/placeholder/'}}}},select:{slug:true}});
    const origin = 'http://127.0.0.1:3108';
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--port','3108','--hostname','127.0.0.1'], { windowsHide: true, env: { ...process.env, DATABASE_URL: `file:${database.replace(/\\/g,'/')}`, AUTH_SECRET: 'isolated-ui-test-auth-secret-123456789', CART_SECRET: 'isolated-ui-test-cart-secret-123456789', PAYMENT_PROVIDER: 'offline', OFFLINE_PAYMENT_INSTRUCTIONS: 'Test-only manual payment instructions. No actual payment is requested.', MAIL_PROVIDER: 'disabled', NODE_ENV: 'production' }, stdio: ['ignore','pipe','pipe'] });
    let logs=''; server.stdout.on('data', x => logs+=x); server.stderr.on('data',x=>logs+=x);
    for(let attempt=0;attempt<100;attempt++){try{if((await fetch(origin+'/admin/login')).ok)break;}catch{} await new Promise(resolve=>setTimeout(resolve,200)); if(attempt===99)throw new Error('Test server failed: '+logs);}
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); debugPage = page; page.on('pageerror', error=>report.errors.push(error.message));
    await page.goto(origin+'/admin/products'); await expect(page).toHaveURL(/\/admin\/login/); pass('Unauthenticated admin access blocked');
    await page.locator('[name=email]').fill('ui-test@example.invalid'); await page.locator('[name=password]').fill('Test-only-password-123!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page).toHaveURL(/\/admin\/products/);
    await page.goto(origin+'/admin/products/new'); await expect(page.locator('[name=stockQty]')).toHaveValue('1'); await expect(page.locator('[name=status]')).toHaveValue('DRAFT');
    await page.locator('[name=name]').fill('QA Manual Item'); await page.locator('[name=brand]').fill('QA Brand'); await page.locator('[name=model]').fill('QA-1');
    const category = await db.category.findFirstOrThrow({ where: { isActive: true } }); await page.locator('[name=categoryId]').selectOption(category.id);
    await page.locator('textarea[name=description]').fill('');
    await page.locator('[name=conditionNote]').fill('Actual condition note for the test item.');
    await page.locator('[name=specifications]').fill('Test fixture specifications.'); await page.locator('[name=includedItems]').fill('Test fixture charger and case.');
    await page.locator('[name=sourceCost]').fill('R1,499.00'); const recommended = await page.locator('[name=price]').inputValue(); assert.ok(Number(recommended)>1499); pass('Cost automatically calculates selling recommendation');
    await page.locator('[name=price]').fill('399.00'); await page.locator('[name=sourceCost]').fill('150.00'); await expect(page.locator('[name=price]')).toHaveValue('399.00'); pass('Manual price override survives cost changes');
    const photos = (await fs.readdir('public/uploads/products')).filter(x=>x.endsWith('.webp')).slice(0,2).map(x=>path.resolve('public/uploads/products',x)); assert.equal(photos.length,2);
    await page.locator('[name=images]').setInputFiles(photos);
    await page.getByRole('button',{name:'Save draft',exact:true}).click(); await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?saved=1/);
    let product = await db.product.findFirstOrThrow({ where: { name: 'QA Manual Item' }, include: { images: { orderBy: { sortOrder:'asc' } } } });
    assert.equal(product.status,'DRAFT'); assert.equal(product.stockQty,1); assert.equal(product.priceCents,39900); assert.equal(product.images.length,2); assert.equal(product.priceManualOverride,true);assert.ok(product.description.includes('Pre-owned item')); ownedUploads.push(...product.images.map(image=>image.url)); pass('Admin creates draft with multiple photos in database');
    for(const image of product.images) assert.equal((await page.request.get(origin+image.url)).status(),200); pass('New runtime uploads are served in production');
    const firstImage = product.images[0].url; const secondImage = product.images[1].url;
    await page.locator('[name=mainImageUrl]').nth(1).check(); await page.locator('[name=productWeightGrams]').fill('700'); await page.locator('[name=packageWeightGrams]').fill('100');
    for(const [name,value] of [['packageLengthCm','20'],['packageWidthCm','14'],['packageHeightCm','8']]) await page.locator(`[name=${name}]`).fill(value);
    await page.locator('[name=measurementSource]').selectOption('MEASURED'); await page.locator('[name=modelSourceUrl]').fill('https://example.com/qa-fixture');
    await page.locator('[name=cleanImageLicense]').fill('Owned test fixture images, original retained.'); await page.locator('[name=specsConfirmed]').check(); await page.locator('[name=itemReviewConfirmed]').check();
    await page.getByRole('button',{name:'Publish',exact:true}).click(); await expect(page).toHaveURL(/saved=1/);
    await expect.poll(async()=> (await db.product.findUniqueOrThrow({where:{id:product.id}})).status).toBe('ACTIVE');
    product = await db.product.findUniqueOrThrow({where:{id:product.id},include:{images:{orderBy:{sortOrder:'asc'}}}}); assert.equal(product.images[0].url,secondImage); pass('Admin edit, main image selection and publish');
    const productUrl=origin+'/product/'+product.slug;
    const publicContext=await browser.newContext({viewport:{width:390,height:844}}); const customer=await publicContext.newPage();customer.on('pageerror', error=>report.errors.push(error.message));
    await customer.goto(productUrl); await expect(customer.getByText('PRE-OWNED',{exact:true})).toBeVisible(); await expect(customer.getByRole('heading',{name:'Specifications',exact:true})).toBeVisible();
    await customer.getByRole('button',{name:'Show image 2 of 2',exact:true}).click();
    const publicHtml=await customer.content(); assert.ok(!/sourceCostCents|researchNotes|priceManualOverride/.test(publicHtml)); pass('Product gallery, specifications, included items and private-field boundary');
    await customer.getByRole('button',{name:'Add to cart',exact:true}).click(); await expect(customer.getByText(/added to your cart/)).toBeVisible();await expect(customer.getByRole('link',{name:'Cart, 1 item',exact:true})).toBeVisible();
    await customer.getByRole('button',{name:'Add to cart',exact:true}).click(); await expect(customer.getByText(/Only 1 of/)).toBeVisible(); pass('Cart rejects quantity above one');
    await customer.goto(origin+'/cart'); await expect(customer.getByText('QA Manual Item',{exact:true})).toBeVisible();
    await customer.getByRole('link',{name:'Proceed to checkout',exact:true}).click();
    for(const [name,value] of [['fullName','QA Customer'],['email','qa-customer@example.invalid'],['phone','0821234567'],['line1','1 QA Road'],['suburb','QA Suburb'],['city','Johannesburg'],['postalCode','2000']]) await customer.locator(`[name=${name}]`).fill(value);
    await customer.locator('[name=province]').selectOption('GP');
    await expect.poll(async()=>customer.locator('[name=quotedShippingCents]').inputValue()).toBe('9900');
    await customer.locator('[name=deliveryMethod][value=LOCKER_TO_KIOSK]').check(); await customer.locator('[name=pickupPoint]').fill('QA kiosk, QA Road, test-reference'); await expect.poll(async()=>customer.locator('[name=quotedShippingCents]').inputValue()).toBe('8900'); pass('Kiosk collection selection and pickup reference');
    await customer.locator('[name=deliveryMethod][value=LOCKER_TO_LOCKER]').check(); await expect.poll(async()=>customer.locator('[name=quotedShippingCents]').inputValue()).toBe('9900');
    await expect(customer.locator('[name=deliveryMethod][value=LOCKER_TO_DOOR]')).toBeDisabled(); pass('To-door stays closed until the fuel surcharge is confirmed');
    for(const route of ['/admin','/admin/products','/admin/pricing','/admin/shipping','/admin/categories','/admin/orders','/admin/customers']){const response=await page.goto(origin+route);assert.equal(response.status(),200,route);} pass('Admin dashboard and management routes');
    if(demo)assert.equal((await customer.request.get(origin+'/product/'+demo.slug)).status(),404); pass('Archived demo product URLs are not public');
    const routes=['/','/shop', '/product/'+product.slug, '/cart','/checkout','/contact','/shipping','/returns','/terms','/privacy','/admin/products/new'];
    for(const width of [320,360,390,430,1440]) {
      for(const route of routes) {
        const target=route.startsWith('/admin')?page:customer; await target.setViewportSize({width,height:900}); const response=await target.goto(origin+route); assert.equal(response.status(),200,route);
        await target.locator('body').waitFor();
        const layout=await target.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})); assert.ok(layout.scroll<=layout.width+1,`Overflow ${route} at ${width}: ${layout.scroll}`);
        if(['/','/product/'+product.slug,'/checkout','/admin/products/new'].includes(route) && [320,390,1440].includes(width)) await target.screenshot({path:path.join(artifacts,`${width}-${route.replace(/[^a-z0-9]/gi,'-')||'home'}.png`),fullPage:true});
      }
      report.viewports.push(width); pass('Routes and no document overflow at '+width+'px');
    }
    await customer.goto(origin+'/checkout');
    for(const [name,value] of [['fullName','QA Customer'],['email','qa-customer@example.invalid'],['phone','0821234567'],['line1','1 QA Road'],['suburb','QA Suburb'],['city','Johannesburg'],['postalCode','2000']]) await customer.locator(`[name=${name}]`).fill(value);
    await customer.locator('[name=province]').selectOption('GP'); await expect.poll(async()=>customer.locator('[name=quotedShippingCents]').inputValue()).toBe('9900');
    await expect(customer.getByRole('button',{name:'Place order',exact:true})).toBeEnabled();await customer.setViewportSize({width:390,height:844});await customer.screenshot({path:path.join(artifacts,'390-checkout-confirmed.png'),fullPage:true}); await customer.getByRole('button',{name:'Place order',exact:true}).click(); await expect(customer).toHaveURL(/\/order\//);
    const order=await db.order.findFirstOrThrow({where:{items:{some:{productId:product.id}}}});assert.equal(order.subtotalCents,39900);assert.equal(order.shippingCents,9900);assert.equal(order.totalCents,49800);assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).stockQty,0);pass('Checkout creates order with subtotal plus customer-paid shipping and sells out stock');
    await customer.goto(productUrl); await expect(customer.getByText('This item is no longer available.',{exact:true})).toBeVisible();
    await page.goto(origin+'/admin/products/'+product.id); await page.getByRole('button',{name:'Archive',exact:true}).click(); await expect.poll(async()=> (await db.product.findUniqueOrThrow({where:{id:product.id}})).status).toBe('ARCHIVED');
    assert.equal((await fs.stat(path.resolve('public',firstImage.slice(1)))).isFile(),true);pass('Archive preserves order history and original photo files');
    const soldFixture=await db.product.create({data:{itemId:'QA-SOLD-FIXTURE',sku:'QA-SOLD-FIXTURE',slug:'qa-manual-sold',name:'QA Mark Sold Fixture',description:'Isolated mark-sold action fixture.',categoryId:category.id,condition:'USED',priceCents:10000,productWeightGrams:1000,packageLengthCm:20,packageWidthCm:10,packageHeightCm:10,status:'ACTIVE',stockQty:1}});
    await page.goto(origin+'/admin/products/'+soldFixture.id);await page.getByRole('button',{name:'Mark sold',exact:true}).click();await expect.poll(async()=>(await db.product.findUniqueOrThrow({where:{id:soldFixture.id}})).status).toBe('SOLD_OUT');assert.equal((await db.product.findUniqueOrThrow({where:{id:soldFixture.id}})).stockQty,0);pass('Admin Mark sold clears stock');
    const sitemap=await (await customer.request.get(origin+'/sitemap.xml')).text(); assert.ok(!sitemap.includes('/product/'+product.slug));
    const robots=await (await customer.request.get(origin+'/robots.txt')).text();assert.ok(robots.includes('/admin')&&robots.includes('/checkout'));pass('Sitemap excludes archived/draft stock; robots protects private routes');
    const notFound=await customer.goto(origin+'/does-not-exist');assert.equal(notFound.status(),404);pass('404 handling');
    assert.equal((await customer.request.post(origin+'/api/payments/peach/notify',{data:{status:'SUCCESS'}})).status(),503);pass('Unconfigured Peach notifications cannot settle payments');
    assert.deepEqual(report.errors,[]);pass('No browser JavaScript exceptions');
    await fs.writeFile(path.join(artifacts,'store-e2e.json'),JSON.stringify({...report,result:'PASS'},null,2));
  } catch(error) { if(debugPage){await debugPage.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(artifacts,'failure.txt'),await debugPage.locator('body').innerText()).catch(()=>{});} await fs.writeFile(path.join(artifacts,'store-e2e.json'),JSON.stringify({...report,result:'FAIL',failure:String(error)},null,2));throw error; }
  finally {
    if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}await db.$disconnect();
    // Only files minted by this isolated test are removed; owner's originals are never touched.
    for(const url of ownedUploads){const key=url.split('/').pop();if(/^[a-z0-9]+-[a-f0-9]{16}\.(jpg|png|webp|avif)$/.test(key))await fs.unlink(path.resolve('public/uploads/products',key)).catch(()=>{});}
    for(const suffix of ['', '-journal','-wal','-shm']) await fs.unlink(database+suffix).catch(()=>{}); await fs.rmdir(directory);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
