/** Apply recorded owner facts; keep unresolved items in draft and originals intact. */
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { parsePricingTiers, sellingPriceFromCost, type PricingSettings } from "../../src/lib/pricing";
import { OWNER_TESTED_TEXT } from "../../src/lib/owner-testing";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
type Intake = { itemId: string; name: string; brandModel: string; sourceCostCents: number | null; sellingPriceCents: number; markup: string; images: string[]; costNote: string; weightNote: string };
async function main() {
  const intake = JSON.parse(await readFile("data/internal/ezpawn-intake.json", "utf8")) as { drafts: Intake[] };
  const saved = await prisma.pricingSetting.findUniqueOrThrow({ where: { id: 1 } });
  const pricing: PricingSettings = { ...saved, tiers: parsePricingTiers(JSON.parse(saved.tiersJson)), roundingMode: saved.roundingMode === "NEAREST" ? "NEAREST" : "UP" };
  if (!pricing.isActive || !pricing.tiers.length) throw new Error("No active recorded pricing rule; ask the owner.");
  const products = await prisma.product.findMany({ include: { images: true }, orderBy: { itemId: "asc" } });
  const changes: Array<{ itemId: string; before: unknown; after: unknown }> = [];
  const missingCosts: Array<{ itemId: string; name: string }> = [];
  const updates: Array<{ id: string; data: { name: string; description: string; conditionNote: string; testingStatus: string; testedAt: Date | null; sourceCostCents: number | null; priceCents: number; status: string; measurementSource: string } }> = [];
  for (const d of intake.drafts) {
    const p = products.find(p => p.itemId === d.itemId);
    if (!p) throw new Error(`Missing product ${d.itemId}`);
    const cost = d.sourceCostCents;
    const ownerTested = p.testingStatus === "TESTED_AND_WORKING";
    const calculated = sellingPriceFromCost(cost, pricing);
    // Preserve every explicitly recorded owner price override (vacuum, helmets, and the Ryobi kit).
    const ownerLocked = d.sellingPriceCents > 0 && /owner set the selling price/i.test(d.markup ?? "");
    const price = ownerLocked ? d.sellingPriceCents : p.priceCents > 0 ? p.priceCents : calculated ?? 0;
    if (calculated == null) missingCosts.push({ itemId: d.itemId, name: d.name });
    const clean = (value: string) => value
      .replace(/Tested and confirmed working before listing\.?\s*/gi, "")
      .replace(/Testing required\.?\s*/gi, "")
      .replace(/No selling price is shown because the shop price was not readable\.?\s*/gi, "")
      .replace(/No shop price was readable\.?\s*/gi, "")
      .replace(/The printed price and a handwritten figure on the same tag do not agree, so no selling price is shown yet\.?\s*/gi, "")
      .replace(/A handwritten shop note mentioned iCloud, so confirm it is signed out before a new Apple ID is expected to work\.?\s*/gi, "")
      .replace(/A shop note mentioned iCloud; confirm it is signed out\.?\s*/gi, "")
      .replace(/(?:A price tag|A tag on a different|A price label|Both boots have a shop tag|It is not clear whether the printed price)[^.]*\.\s*/gi, "")
      .trim();
    let overview = clean(p.description.split("\n\nCondition:")[0]);
    if (d.itemId === "2DS-0092") overview = "A used blue and black high pressure washer with hose, lance, gun and power lead. Dirt and scuffs are visible. The motor-housing close-up and full-machine photograph show the same item. Second-hand, not refurbished or new.";
    const spec = d.brandModel
      .replace(/,?\s*shop ref\s+[^.]+\.?/gi, "")
      .replace(/Shop tag ref\s+[^.]+\.?/gi, "")
      .replace(/,?\s*reduced shop price/gi, "")
      .replace(/,?\s*no shop price tag/gi, "")
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => !/\b(?:tag|price|ref|digits)\b/i.test(sentence))
      .join(" ")
      .trim();
    const condition = clean(p.conditionNote || "Used; refer to the item photographs for cosmetic condition.");
    const description = [overview, `Condition: ${condition}`, spec ? `Recorded model information: ${spec}` : "", "Included items: Accessories explicitly described above are part of the recorded listing. Other products visible in the background are not included. Accessory availability must be confirmed before sale.", d.itemId === "2DS-0047" ? "Important: The owner’s intake record says this iPad is iCloud locked. It cannot be offered as an unrestricted working iPad. Lock status and the intended sale condition require confirmation." : "", ownerTested ? OWNER_TESTED_TEXT : "Testing: Physical test results are awaiting owner confirmation; functionality is not confirmed by these photographs.", "Delivery: The Courier Guy. Estimated delivery typically 1–3 working days depending on destination and courier service. Processing time may apply before dispatch."].filter(Boolean).join("\n\n");
    const data = { name: d.name, description, conditionNote: condition, testingStatus: ownerTested ? "TESTED_AND_WORKING" : "NOT_TESTED", testedAt: p.testedAt, sourceCostCents: cost, priceCents: price, status: "DRAFT", measurementSource: /estimate/i.test(d.weightNote || "") ? "ESTIMATED" : p.measurementSource };
    updates.push({ id: p.id, data });
    changes.push({ itemId: p.itemId, before: { name:p.name, description:p.description, conditionNote:p.conditionNote, testingStatus:p.testingStatus, testedAt:p.testedAt, sourceCostCents:p.sourceCostCents, priceCents:p.priceCents, status:p.status, measurementSource:p.measurementSource }, after: data });
  }
  const duplicates = products.filter(p=>p.itemId === "2DS-0091");
  // Recorded owner correction: 0091's motor close-up belongs to 0092, not a second pump.
  const examples = products.filter(p=>p.images.length && p.images.every(im=>im.url.startsWith("/placeholder/")));
  const report = { at: new Date().toISOString(), applied: APPLY, pricing, missingCosts, changes, archivedDuplicates: duplicates.map(p=>({id:p.id,itemId:p.itemId,status:p.status})), archivedExamples: examples.map(p=>({id:p.id,itemId:p.itemId,status:p.status})), note:"No product or order history is deleted. Existing physical-testing confirmations are preserved. Drafts await remaining shipping rates and photo review." };
  if (APPLY) {
    const backup = `data/internal/backups/catalogue-${Date.now()}`;
    await mkdir(backup,{recursive:true});
    await copyFile("prisma/dev.db",`${backup}/dev.db`);
    await copyFile("data/internal/ezpawn-intake.json",`${backup}/ezpawn-intake.json`);
    await writeFile(`${backup}/changes.json`,JSON.stringify(report,null,2)+"\n");
    await prisma.$transaction(async tx=> {
      for(const update of updates) await tx.product.update({where:{id:update.id},data:update.data});
      for(const p of [...duplicates,...examples]) await tx.product.update({where:{id:p.id},data:{status:"ARCHIVED",isFeatured:false}});
      const washer = await tx.product.findUniqueOrThrow({where:{itemId:"2DS-0092"},include:{images:true}});
      const ledger = intake.drafts.find(d=>d.itemId === "2DS-0092")!;
      for(const [index,url] of ledger.images.entries()) if(!washer.images.some(im=>im.url===url)) await tx.productImage.create({data:{productId:washer.id,url,sortOrder:index,alt:"Another view of the same used blue pressure washer"}});
      await tx.shippingSetting.update({where:{id:1},data:{lockerEnabled:false,courierEnabled:true,courierEtaMinDays:1,courierEtaMaxDays:3}});
    });
    console.log(`Backup: ${backup}`);
  }
  await writeFile("data/internal/catalogue-completion.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({applied:APPLY,products:updates.length,missingCosts,archivedExamples:examples.length,duplicateItems:duplicates.map(p=>p.itemId),prices:updates.map(u=>({itemId:products.find(p=>p.id===u.id)!.itemId,price:u.data.priceCents/100}))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
