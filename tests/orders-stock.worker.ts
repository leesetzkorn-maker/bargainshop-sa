// Runs only against the disposable database supplied by orders-stock.test.ts.
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createOrderFromCheckout } from "../src/lib/dal/orders";
import type { CheckoutInput } from "../src/lib/validation";

async function main() {
  assert.match(process.env.DATABASE_URL ?? "", /2de-stock-test-/);
  const category = await prisma.category.create({ data: { name: "Stock test fixture", slug: `stock-test-${Date.now()}` } });
  const product = await prisma.product.create({ data: {
    itemId: "STOCK-TEST-1", sku: "STOCK-TEST-1", slug: "stock-test-last-item", name: "Single test item",
    categoryId: category.id, description: "Pre-owned test fixture, known condition and accessories.", condition: "USED",
    stockQty: 1, status: "ACTIVE", sourceCostCents: 5000, priceCents: 10000,
    productWeightGrams: 800, packageWeightGrams: 200, packageLengthCm: 20, packageWidthCm: 15, packageHeightCm: 10,
    measurementSource: "MEASURED", brand: "Fixture", model: "ONE", modelSourceUrl: "https://example.com/fixture",
    specsConfirmed: true, itemReviewConfirmed: true, cleanImageLicense: "Fixture image",
    images: { create: [{ url: "/uploads/products/stock-test.webp" }, { url: "/uploads/products/stock-test-original.webp" }] },
  } });
  await prisma.shippingSetting.upsert({ where: { id: 1 }, update: { isActive: true, ratesConfirmed: true, doorFuelSurchargePercent: 0, etaMinDays: 1, etaMaxDays: 3 }, create: { id: 1, isActive: true, ratesConfirmed: true } });
  await prisma.shippingTier.deleteMany({});
  await prisma.shippingTier.create({ data: { code: "QA", name: "Confirmed test tariff", sortOrder: 10, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 41, maxWeightGrams: 20000, lockerToLockerCents: 9900, lockerToDoorCents: 14900, lockerToKioskCents: 8900, kioskToDoorCents: 19900 } });
  const input: CheckoutInput = { fullName: "Test Customer", email: "customer@example.invalid", phone: "0821234567", line1: "1 Test Road", suburb: "Test", city: "Johannesburg", province: "GP", postalCode: "2000", deliveryMethod: "LOCKER_TO_LOCKER", pickupPoint: "Test locker, 1 Test Road, ref-1", quotedShippingCents: 9900, quotedSubtotalCents: 10000 };
  const cart = [{ slug: product.slug, quantity: 1 }];
  const stale = await createOrderFromCheckout(cart, { ...input, quotedShippingCents: 100 });
  assert.equal(stale.ok, false);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty, 1);
  const results = await Promise.all([createOrderFromCheckout(cart, input), createOrderFromCheckout(cart, { ...input, email: "second@example.invalid" })]);
  assert.equal(results.filter((result) => result.ok).length, 1, "Only one customer can reserve the last item");
  const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(after.stockQty, 0);
  assert.equal(after.status, "SOLD_OUT");
  const orders = await prisma.order.findMany({ where: { items: { some: { productId: product.id } } } });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].subtotalCents, 10000);
  assert.equal(orders[0].shippingCents, 9900);
  assert.equal(orders[0].totalCents, 19900);
  assert.equal("sourceCostCents" in results.find((result) => result.ok)!, false);
  const again = await createOrderFromCheckout(cart, input);
  assert.equal(again.ok, false);
  console.log("PASS: stale quote rejected; one order wins; stock sold out; customer pays product plus shipping.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
