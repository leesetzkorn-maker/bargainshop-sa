/**
 * Import the EZ Pawn photo intake as unpublished drafts.
 *
 * Originals stay where they were extracted. This script only writes cleaned
 * WebP copies under public/uploads/products and draft rows. Acquisition cost
 * goes in sourceCostCents and supplierNotes, which the storefront never selects.
 *
 * Selling prices stay at 0 until an owner turns the markup on and applies it.
 * Nothing here chooses a markup.
 *
 * Run: npx tsx scripts/import-ezpawn.ts
 */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { calculateShipping, type ShippingRule, type ShippingSettings } from "../src/lib/shipping/engine";
import { formatItemNumber, nextItemNumberSuggestion } from "../src/lib/enums";
import { slugify } from "../src/lib/utils";

const prisma = new PrismaClient();

const CLEAN = join(
  "C:\\Users\\leese\\.grok\\sessions\\c%3A%5CUsers%5Cleese%5CDesktop%5Conline%20sec%20store\\01a0e6f9-aafb-7d41-92e8-31ced8003e40\\images",
);
const ORIGINALS = "C:\\Users\\leese\\AppData\\Local\\Temp\\2de-ezpawn-extract";
const UPLOADS = join(process.cwd(), "public", "uploads", "products");

interface Shot {
  file: string;
  alt: string;
}

interface Intake {
  key: string;
  name: string;
  brandModel: string;
  categorySlug: string;
  condition: "VERY_GOOD" | "GOOD" | "USED" | "AS_IS";
  conditionNote: string;
  description: string;
  /** Confirmed acquisition cost in cents. Null when the photo shows two prices or none. */
  sourceCostCents: number | null;
  costNote: string;
  supplierRef: string;
  shots: Shot[];
  /** Grams. Null when a number would be a guess. */
  weightGrams: number | null;
  weightNote: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Why locker or courier must not be assumed. */
  shippingFlag: string | null;
  checklist: string[];
  photoNote?: string;
}

const INTAKE: Intake[] = [
  {
    key: "canister-vacuum",
    name: "Red canister vacuum cleaner",
    brandModel: "Canister vacuum, brand not readable once the shop sticker is removed",
    categorySlug: "home-small-appliances",
    condition: "USED",
    conditionNote: "Used — scratches and scuffs are visible on the red lid. Testing required.",
    description:
      "A used red canister vacuum with a hose and a silver handle. The lid has visible scratches from previous use. The brand was only on the shop sticker, so it is not stated here. Testing required. This is not refurbished and it is not new.",
    sourceCostCents: null,
    costNote: "Printed shop tag read as R1,299.00. A second handwritten mark on the lid was not clear enough to treat as the cost. Confirm which figure is the acquisition cost before pricing.",
    supplierRef: "tag on lid, number not fully read",
    shots: [{ file: "12.jpg", alt: "Used red canister vacuum cleaner with visible scratches on the lid" }],
    weightGrams: null,
    weightNote: "Weight not estimated. A canister vacuum with hose is often several kilograms and needs a scale.",
    lengthCm: 45,
    widthCm: 35,
    heightCm: 40,
    shippingFlag: "Too bulky to assume locker delivery. Dimensions above are a rough parcel guess, not a measurement. Confirm size and weight before quoting a courier.",
    checklist: [
      "Power on from a wall socket",
      "Suction at the hose",
      "Hose and wand seat properly",
      "Wheels and carry handle",
      "No burning smell",
    ],
  },
  {
    key: "redmi-a3x",
    name: "Redmi A3X 64GB smartphone",
    brandModel: "Xiaomi Redmi A3X, 64GB, shop ref S029725A",
    categorySlug: "electronics",
    condition: "USED",
    conditionNote: "Used — fingerprints and light wear on the back. Testing required.",
    description:
      "A used Redmi A3X with 64GB, black, as shown from the back. Fingerprints and light wear are visible. It has not been powered on by the store. Testing required. Not refurbished and not new. Network, battery health and account lock have not been checked.",
    sourceCostCents: 99500,
    costNote: "Single printed tag: R995.00, ref S029725A.",
    supplierRef: "S029725A",
    shots: [{ file: "15.jpg", alt: "Back of a used black Redmi A3X smartphone on a wooden table" }],
    weightGrams: 200,
    weightNote: "About 200g for the handset. Charger was not in the photo, so it is not included in the weight.",
    lengthCm: 18,
    widthCm: 10,
    heightCm: 3,
    shippingFlag: null,
    checklist: [
      "Powers on",
      "Display and touch",
      "Charge port",
      "Front and rear camera open",
      "Not locked to an account",
      "Speaker and microphone",
    ],
  },
  {
    key: "ipad-16gb",
    name: "iPad 16GB with pouch and charger",
    brandModel: "Apple iPad 16GB, shop ref S001385A. Tag said pouch and charger included.",
    categorySlug: "electronics",
    condition: "USED",
    conditionNote: "Used — scuffs on the aluminium back. Testing required. iCloud status unknown.",
    description:
      "A used silver iPad marked 16GB on the back. Scuffs are visible. The shop note on the original photo mentioned iCloud, and that has not been checked — it may not be usable until it is signed out. The shop tag said a pouch and charger are included; they are not in this photo. Testing required. Not refurbished and not new.",
    sourceCostCents: null,
    costNote: "Printed tag R1,850.00, ref S001385A. A handwritten sticker also read R500 and mentioned iCloud. Do not pick one until confirmed.",
    supplierRef: "S001385A",
    shots: [{ file: "10.jpg", alt: "Back of a used silver 16GB iPad with visible scuffs" }],
    weightGrams: 750,
    weightNote: "Estimate for an early iPad plus a pouch. Confirm on a scale, especially if the charger is in the parcel.",
    lengthCm: 28,
    widthCm: 22,
    heightCm: 5,
    shippingFlag: "Weight is an estimate. Locker is likely if it stays under 2kg and 35cm, but confirm before promising a method.",
    checklist: [
      "Powers on",
      "Not iCloud locked or passcode locked",
      "Display and touch",
      "Home button",
      "Charges with the included charger",
      "Wi-Fi joins a network",
    ],
  },
  {
    key: "ps4-plain",
    name: "PlayStation 4 console with one controller",
    brandModel: "Sony PlayStation 4, shop ref S029487A, one controller",
    categorySlug: "electronics",
    condition: "USED",
    conditionNote: "Used — the controller is worn and has a string tied to it. Testing required.",
    description:
      "A used black PlayStation 4 with one black controller. The controller shows wear and still has a piece of string tied to it. Dust is visible. Cables, power lead and games were not in the photo and are not included unless confirmed. Testing required. Not refurbished and not new. 2DE-STORE is not affiliated with Sony.",
    sourceCostCents: 289500,
    costNote: "Tag on this console: PS4 console with 1 controller, R2,895.00, ref S029487A.",
    supplierRef: "S029487A",
    shots: [{ file: "16.jpg", alt: "Used black PlayStation 4 with a worn controller on top" }],
    weightGrams: null,
    weightNote: "A PS4 plus controller is usually over 2kg. Not weighed.",
    lengthCm: 40,
    widthCm: 30,
    heightCm: 15,
    shippingFlag: "Not suitable for the current locker limits if it is a normal PS4 parcel. Do not quote courier until it is weighed and measured.",
    checklist: [
      "Powers on and reaches the menu",
      "Controller pairs and the buttons and sticks respond",
      "Disc drive accepts and ejects a disc, if this unit has one",
      "HDMI picture",
      "No overheating in a few minutes of menu use",
    ],
  },
  {
    key: "titan-ps4-bundle",
    name: "Titan PS4 wireless controller and wired headset",
    brandModel: "Titan PS4 wireless BT controller with wired gaming headset, shop ref S028519A",
    categorySlug: "electronics",
    condition: "GOOD",
    conditionNote: "Good — sold as the boxed set in the photo. The box has shelf wear. Testing required.",
    description:
      "A boxed Titan set: a PS4 wireless Bluetooth controller and a wired gaming headset, as printed on the box. The box shows normal shelf wear. The contents have not been opened and checked by the store. Testing required. Not refurbished and not new. Compatible with PlayStation 4 and PC according to the box, which has not been verified.",
    sourceCostCents: 45000,
    costNote: "Single tag: R450.00, ref S028519A.",
    supplierRef: "S028519A",
    shots: [{ file: "11.jpg", alt: "Boxed Titan PS4 wireless controller and wired gaming headset" }],
    weightGrams: 800,
    weightNote: "Estimate for the boxed set. Confirm on a scale.",
    lengthCm: 28,
    widthCm: 22,
    heightCm: 10,
    shippingFlag: "Weight and box size are estimates. Likely a locker parcel, but confirm before promising it.",
    checklist: [
      "Box contents match the printed set",
      "Controller charges or takes batteries and pairs",
      "Headset sound and microphone",
      "Cable and inline control present",
    ],
  },
  {
    key: "xbox-one-s-all-digital",
    name: "Xbox One S All Digital with controller and cables",
    brandModel: "Microsoft Xbox One S All Digital, shop ref S029327A",
    categorySlug: "electronics",
    condition: "GOOD",
    conditionNote: "Good — photographed as the retail box. The box is creased. Testing required.",
    description:
      "An Xbox One S All Digital console in its retail box. The shop tag said it includes a controller and cables. The box is creased. The store has not opened it or switched it on. Testing required. Not refurbished and not new. 2DE-STORE is not affiliated with Microsoft. A separate controller tag was sitting on this box and is not part of this listing.",
    sourceCostCents: 325000,
    costNote: "Tag on the box: Xbox One S with controller and cables in box, R3,250.00, ref S029327A. A different tag (S026341A, R2,895.00, Xbox One console with 1 controller) was on a controller resting on the box and was not treated as this item.",
    supplierRef: "S029327A",
    shots: [{ file: "19.jpg", alt: "Xbox One S All Digital retail box, creased, shop sticker removed" }],
    weightGrams: null,
    weightNote: "Retail box not weighed. These boxes are often over 2kg and longer than the locker limit.",
    lengthCm: 40,
    widthCm: 32,
    heightCm: 12,
    shippingFlag: "Do not offer locker delivery. The box is likely over the locker length or weight. Confirm measurements before a courier quote.",
    checklist: [
      "Box contains the console, one controller and the cables named on the tag",
      "Powers on to the dashboard",
      "Controller pairs",
      "HDMI picture",
      "No account lock that blocks setup",
    ],
    photoNote: "Cleaned image is the back of the retail box. A second original photo shows the box with another priced controller on top and was not used as the customer photo.",
  },
  {
    key: "ps4-portrait",
    name: "PlayStation 4 console with portrait skin and one controller",
    brandModel: "Sony PlayStation 4 with a portrait skin, shop ref S028768A",
    categorySlug: "electronics",
    condition: "USED",
    conditionNote: "Used — the skin and the controller are heavily worn. Testing required.",
    description:
      "A used PlayStation 4 with a black-and-white portrait skin and one black controller. The skin edges and the controller are heavily worn. That wear is part of the item. Games and cables were not in the photo. Testing required. Not refurbished and not new. 2DE-STORE is not affiliated with Sony.",
    sourceCostCents: 295000,
    costNote: "Sticker on this console: PS4 console with 1 controller, R2,950.00, ref S028768A. A hanging tag in the same photo (S028334A, R2,895.00, PS4 with 2 remotes) may belong to a different item. Confirm before treating them as one.",
    supplierRef: "S028768A",
    shots: [{ file: "14.jpg", alt: "Used PlayStation 4 with a worn portrait skin and a worn controller" }],
    weightGrams: null,
    weightNote: "Not weighed. A PS4 parcel is usually over the 2kg locker limit.",
    lengthCm: 40,
    widthCm: 30,
    heightCm: 15,
    shippingFlag: "Not suitable for locker on a normal PS4 parcel. Confirm weight and size before quoting courier.",
    checklist: [
      "Powers on",
      "Controller pairs and inputs respond",
      "Disc drive, if present",
      "HDMI picture",
      "Skin is not hiding a cracked panel",
    ],
  },
  {
    key: "xbox-one-two-controllers",
    name: "Xbox One console with two controllers",
    brandModel: "Microsoft Xbox One, shop ref S029284A",
    categorySlug: "electronics",
    condition: "USED",
    conditionNote: "Used — the console top is scratched. Both controllers show wear. Testing required.",
    description:
      "A used black Xbox One with two controllers, one grey and one with a decorative shell. Scratches on the console are visible and are part of the item. Cables were not clearly included in the photo. Testing required. Not refurbished and not new. 2DE-STORE is not affiliated with Microsoft.",
    sourceCostCents: 245000,
    costNote: "Sticker on the console: Xbox One with 2 controllers, R2,450.00, ref S029284A.",
    supplierRef: "S029284A",
    shots: [{ file: "13.jpg", alt: "Used black Xbox One with scratches and two worn controllers" }],
    weightGrams: null,
    weightNote: "Not weighed. Console plus two controllers is over a typical 2kg locker limit.",
    lengthCm: 40,
    widthCm: 32,
    heightCm: 16,
    shippingFlag: "Do not offer locker delivery until weighed. Likely courier only.",
    checklist: [
      "Powers on to the dashboard",
      "Both controllers pair and their buttons respond",
      "HDMI picture",
      "Disc drive accepts and ejects",
      "No account lock that blocks setup",
    ],
  },
  {
    key: "pulse-3d",
    name: "PlayStation Pulse 3D wireless headset",
    brandModel: "Sony PlayStation Pulse 3D, in box, shop ref S028335A",
    categorySlug: "electronics",
    condition: "GOOD",
    conditionNote: "Good — boxed, with light scuffs on the carton. Testing required.",
    description:
      "A PlayStation Pulse 3D wireless headset in its retail box. The carton has light scuffs. The store has not opened the box or tested the headset. Testing required. Not refurbished and not new. 2DE-STORE is not affiliated with Sony.",
    sourceCostCents: 89500,
    costNote: "Single tag: PS5 Pulse 3D wireless headset in box, R895.00, ref S028335A.",
    supplierRef: "S028335A",
    shots: [{ file: "20.jpg", alt: "PlayStation Pulse 3D headset box with light carton scuffs" }],
    weightGrams: 450,
    weightNote: "Estimate for the boxed headset. Confirm on a scale.",
    lengthCm: 24,
    widthCm: 22,
    heightCm: 10,
    shippingFlag: "Size and weight are estimates. Probably locker-sized, but confirm.",
    checklist: [
      "Headset, dongle and cable are in the box",
      "Powers on and pairs",
      "Sound from both ears",
      "Microphone",
    ],
  },
  {
    key: "vankyo-projector",
    name: "Vankyo Leisure 495W projector",
    brandModel: "Vankyo Leisure 495W, in box, shop ref S028034A",
    categorySlug: "electronics",
    condition: "GOOD",
    conditionNote: "Good — boxed, carton is creased and torn at the top. Testing required.",
    description:
      "A Vankyo Leisure 495W projector in its retail box. The box is creased and torn at the top. The box prints 220 lumen brightness and 1080p. The store has not opened it or checked that those figures match the unit. Testing required. Not refurbished and not new.",
    sourceCostCents: 69500,
    costNote: "Single tag: Vankyo projector in box, R695.00, ref S028034A.",
    supplierRef: "S028034A",
    shots: [{ file: "18.jpg", alt: "Vankyo Leisure 495W projector box with a torn top edge" }],
    weightGrams: null,
    weightNote: "Box not weighed.",
    lengthCm: 36,
    widthCm: 28,
    heightCm: 12,
    shippingFlag: "The box looks close to or over the locker length. Do not promise locker delivery until it is measured.",
    checklist: [
      "Projector, power supply and remote are in the box",
      "Powers on and projects an image",
      "Focus works",
      "Fan is not grinding",
    ],
  },
  {
    key: "dell-e7470",
    name: "Dell Latitude E7470 laptop with charger",
    brandModel: "Dell Latitude E7470, Core i5, shop ref S028883A. Tag said a charger is included.",
    categorySlug: "electronics",
    condition: "USED",
    conditionNote: "Used — dust and wear on the keyboard and palm rest. Testing required.",
    description:
      "A used Dell Latitude E7470 laptop. Dust and wear on the keyboard and palm rest are visible. The screen was off in the photo. The shop tag said a charger is included; the charger is not in this photo, so confirm it before publishing. Battery health, storage and whether it boots have not been checked. Testing required. Not refurbished and not new.",
    sourceCostCents: 265000,
    costNote: "Single tag: Dell Core i5 with charger, R2,650.00, ref S028883A.",
    supplierRef: "S028883A",
    shots: [{ file: "17.jpg", alt: "Open used black Dell Latitude laptop with a dusty keyboard" }],
    weightGrams: null,
    weightNote: "An E7470 is about 1.5kg before the charger. Not weighed, and a packed laptop is often longer than 35cm.",
    lengthCm: 38,
    widthCm: 28,
    heightCm: 8,
    shippingFlag: "Likely too long for the locker once packed. Confirm measurements. Do not promise locker delivery.",
    checklist: [
      "Boots to the desktop",
      "Keyboard and trackpad",
      "Display has no obvious lines",
      "Charges with the included charger",
      "Wi-Fi",
      "Battery holds a charge for a few minutes off the charger — do not quote a health percentage",
    ],
  },
  {
    key: "grilling-machine",
    name: "George Foreman Lean Mean Fat Grilling Machine",
    brandModel: "George Foreman Lean Mean Fat Grilling Machine, shop ref S027426A",
    categorySlug: "kitchen-appliances",
    condition: "USED",
    conditionNote: "Used — grease and scuffs on the lid. Testing required.",
    description:
      "A used George Foreman Lean Mean Fat Grilling Machine. Grease and scuffs on the lid are visible and are part of the item. It has not been plugged in. Testing required. Not refurbished and not new.",
    sourceCostCents: null,
    costNote: "Printed tag R295.00, ref S027426A. A handwritten 200 is also on the sticker. Confirm which is the acquisition cost.",
    supplierRef: "S027426A",
    shots: [{ file: "23.jpg", alt: "Used George Foreman grilling machine with grease and scuffs on the lid" }],
    weightGrams: null,
    weightNote: "Not weighed. These grills are often 2kg or more and awkward to pack.",
    lengthCm: 40,
    widthCm: 35,
    heightCm: 18,
    shippingFlag: "Do not assume locker delivery. Confirm weight and packed size. Likely courier.",
    checklist: [
      "Powers on",
      "Both plates heat",
      "Thermostat clicks",
      "Drip tray present",
      "Lid closes",
    ],
  },
  {
    key: "bosch-coffee",
    name: "Bosch capsule coffee machine",
    brandModel: "Bosch capsule machine, model number not readable, reduced shop price",
    categorySlug: "kitchen-appliances",
    condition: "USED",
    conditionNote: "Used — scratches and dust on the top. Testing required.",
    description:
      "A used red and black Bosch capsule coffee machine. Scratches and dust are visible. The exact model number was not readable. It has not been run. Testing required. Not refurbished and not new. The customer photo was cleaned up to remove the price sticker and should be checked against the machine before publishing.",
    sourceCostCents: 10000,
    costNote: "Reduced sticker: was R250, now R100. R100 is recorded as the current acquisition cost. A torn second tag was not readable.",
    supplierRef: "reduced sticker, no supplier code read",
    shots: [{ file: "25.jpg", alt: "Used red and black Bosch capsule coffee machine" }],
    weightGrams: null,
    weightNote: "Not weighed. Capsule machines are often over 2kg.",
    lengthCm: 30,
    widthCm: 25,
    heightCm: 30,
    shippingFlag: "Do not assume locker delivery. Height and weight both need measuring. Likely courier.",
    checklist: [
      "Powers on",
      "Water tank and drip tray present",
      "A capsule cycle runs and heats",
      "No leak",
      "Model number recorded from the base plate",
    ],
    photoNote: "The cleaned photo is a straightened view made so the price sticker is gone. Compare it with the machine before publishing.",
  },
  {
    key: "folding-knife",
    name: "Silver folding knife",
    brandModel: "Folding knife, small mark on the blade, no shop price tag",
    categorySlug: "hand-tools",
    condition: "USED",
    conditionNote: "Used — marks on the handle. Testing required only as a mechanical check of the pivot.",
    description:
      "A used silver folding knife with a textured handle. Marks on the handle are visible. There was no price on the photo, so this draft has no cost and no selling price. The blade opens. Not refurbished and not new.",
    sourceCostCents: null,
    costNote: "No price tag in either photo. Do not invent a cost.",
    supplierRef: "none",
    shots: [
      { file: "21.jpg", alt: "Open used silver folding knife with a textured handle" },
      { file: join(ORIGINALS, "IMG-20260928-WA0183.jpeg"), alt: "The same folding knife closed" },
    ],
    weightGrams: 150,
    weightNote: "Light. About 150g. Confirm if it will be packed with anything else.",
    lengthCm: 16,
    widthCm: 6,
    heightCm: 3,
    shippingFlag: null,
    checklist: ["Opens and closes", "Pivot is not loose enough to be unsafe", "Lock, if any, holds"],
  },
  {
    key: "puma-watch",
    name: "Black Puma wristwatch",
    brandModel: "Puma wristwatch, black strap. Price tag in the original photo was not readable.",
    categorySlug: "other-bargains",
    condition: "USED",
    conditionNote: "Used — marks on the glass. Testing required.",
    description:
      "A used black Puma wristwatch on a black strap. Marks on the glass are visible. It has not been checked for timekeeping, and there was no readable price, so this draft has no cost and no selling price. Not refurbished and not new.",
    sourceCostCents: null,
    costNote: "A tag was in the original photo but the price could not be read. Do not invent a cost.",
    supplierRef: "unreadable",
    shots: [{ file: "22.jpg", alt: "Used black Puma wristwatch with marks on the glass" }],
    weightGrams: 80,
    weightNote: "Estimate. Obviously under the locker weight, but still confirm if you want an exact figure.",
    lengthCm: 12,
    widthCm: 10,
    heightCm: 6,
    shippingFlag: null,
    checklist: ["Runs", "Crown changes the time", "Strap is intact", "Glass damage matches the photo"],
  },
];

const NOT_IMPORTED = [
  {
    reason: "Group photo of a phone cabinet. Prices were behind glass and are not reliable enough to store as costs. Each phone needs its own photo.",
    file: "IMG-20260928-WA0157.jpeg",
  },
  {
    reason: "Two shelves of game cases. No individual price tags, so they were not listed.",
    files: ["IMG-20260928-WA0171.jpeg", "IMG-20260928-WA0173.jpeg"],
  },
  {
    reason: "Tag S026341A, R2,895, Xbox One console with 1 controller, was on a controller sitting on the Xbox One S box. It was not given its own listing because the photo is of the other product.",
    file: "IMG-20260928-WA0161.jpeg",
  },
];

function toWebp(source: string, dest: string) {
  const script = [
    "from PIL import Image",
    `im = Image.open(${JSON.stringify(source)}).convert("RGB")`,
    `im.save(${JSON.stringify(dest)}, "WEBP", quality=82, method=6)`,
  ].join("\n");
  const result = spawnSync("python", ["-c", script], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`WebP conversion failed for ${source}\n${result.stderr || result.stdout}`);
  }
}

function shotPath(shot: Shot): string {
  return shot.file.includes("\\") || shot.file.includes(":") ? shot.file : join(CLEAN, shot.file);
}

async function main() {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(categories.map((category) => [category.slug, category.id]));

  const existingItems = await prisma.product.findMany({ select: { itemId: true } });
  let nextNumber = nextItemNumberSuggestion(existingItems.map((row) => row.itemId));

  const settingsRow = await prisma.shippingSetting.findUnique({ where: { id: 1 } });
  const rules = await prisma.shippingRule.findMany({ where: { isActive: true } });
  if (!settingsRow) throw new Error("Shipping settings are missing.");

  const settings: ShippingSettings = {
    isActive: settingsRow.isActive,
    lockerEnabled: settingsRow.lockerEnabled,
    lockerMaxWeightGrams: settingsRow.lockerMaxWeightGrams,
    lockerMaxLengthCm: settingsRow.lockerMaxLengthCm,
    lockerMaxWidthCm: settingsRow.lockerMaxWidthCm,
    lockerMaxHeightCm: settingsRow.lockerMaxHeightCm,
    lockerMaxSumCm: settingsRow.lockerMaxSumCm,
    courierEnabled: settingsRow.courierEnabled,
    deliverySurchargeCents: settingsRow.deliverySurchargeCents,
    freeShippingAboveCents: settingsRow.freeShippingAboveCents,
    handlingFeeCents: settingsRow.handlingFeeCents,
    lockerEtaMinDays: settingsRow.lockerEtaMinDays,
    lockerEtaMaxDays: settingsRow.lockerEtaMaxDays,
    courierEtaMinDays: settingsRow.courierEtaMinDays,
    courierEtaMaxDays: settingsRow.courierEtaMaxDays,
  };

  await mkdir(UPLOADS, { recursive: true });
  const report: unknown[] = [];

  for (const item of INTAKE) {
    const marker = `INTAKE ezpawn key=${item.key}`;
    const already = await prisma.product.findFirst({
      where: { supplierNotes: { contains: marker } },
      select: { id: true, itemId: true },
    });

    const itemId = already?.itemId ?? nextNumber;
    if (!already) {
      const sequence = Number.parseInt(itemId.slice(itemId.lastIndexOf("-") + 1), 10);
      nextNumber = formatItemNumber(sequence + 1);
    }

    const slugBase = slugify(item.name);
    const images: { url: string; alt: string; sortOrder: number }[] = [];
    let index = 0;
    for (const shot of item.shots) {
      const filename = `${itemId.toLowerCase()}-${slugBase}${index === 0 ? "" : `-${index + 1}`}.webp`;
      const dest = join(UPLOADS, filename);
      toWebp(shotPath(shot), dest);
      images.push({ url: `/uploads/products/${filename}`, alt: shot.alt, sortOrder: index });
      index += 1;
    }

    let shippingNote = item.shippingFlag ?? "No shipping flag.";
    if (item.weightGrams != null) {
      const quote = calculateShipping(
        [
          {
            productId: item.key,
            itemId,
            name: item.name,
            quantity: 1,
            productWeightGrams: item.weightGrams,
            packageWeightGrams: 0,
            packageLengthCm: item.lengthCm,
            packageWidthCm: item.widthCm,
            packageHeightCm: item.heightCm,
          },
        ],
        settings,
        rules.map((rule) => ({ ...rule, method: rule.method as ShippingRule["method"], provinceCodes: rule.provinceCodes.split(",").filter(Boolean), postalCodePrefixes: rule.postalCodePrefixes.split(",").filter(Boolean) })),
        { subtotalCents: 0 },
      );
      const locker = quote.methods.find((method) => method.method === "LOCKER");
      const courier = quote.methods.find((method) => method.method === "COURIER");
      shippingNote = [
        item.weightNote,
        item.shippingFlag,
        locker?.available
          ? `Provisional locker quote from the current rate card: R${(locker.priceCents / 100).toFixed(2)}. Weight is still an estimate.`
          : `Locker: ${locker?.unavailableReason ?? "not available"}.`,
        courier?.available
          ? `Provisional courier quote from the current rate card: R${(courier.priceCents / 100).toFixed(2)}. Weight is still an estimate.`
          : `Courier: ${courier?.unavailableReason ?? "not available"}.`,
      ]
        .filter(Boolean)
        .join(" ");
    } else {
      shippingNote = `${item.weightNote} ${item.shippingFlag ?? ""} Shipping was not quoted.`.trim();
    }

    const supplierNotes = [
      marker,
      `Brand/model: ${item.brandModel}`,
      `Supplier ref: ${item.supplierRef}`,
      `Cost: ${item.costNote}`,
      "Selling price: not calculated. Markup is off until you set and apply it.",
      `Weight: ${item.weightNote}`,
      `Shipping: ${shippingNote}`,
      `Checklist: ${item.checklist.join("; ")}`,
      item.photoNote ?? "",
      "Customer must not see this note.",
    ]
      .filter(Boolean)
      .join("\n");

    const categoryIdForItem = categoryId.get(item.categorySlug);
    if (!categoryIdForItem) throw new Error(`Missing category ${item.categorySlug}`);

    const data = {
      name: item.name,
      description: item.description,
      categoryId: categoryIdForItem,
      condition: item.condition,
      conditionNote: item.conditionNote,
      testingStatus: "NOT_TESTED",
      testedAt: null,
      priceCents: 0,
      sourceCostCents: item.sourceCostCents,
      supplierNotes,
      adminNotes: `Draft from the shop photo intake. ${item.costNote} ${shippingNote}`,
      productWeightGrams: item.weightGrams ?? 0,
      packageWeightGrams: 0,
      packageLengthCm: item.lengthCm,
      packageWidthCm: item.widthCm,
      packageHeightCm: item.heightCm,
      stockQty: 1,
      status: "DRAFT",
      isFeatured: false,
    };

    if (already) {
      await prisma.product.update({
        where: { id: already.id },
        data: {
          ...data,
          images: { deleteMany: {}, create: images },
        },
      });
      console.log(`updated ${itemId} ${item.name}`);
    } else {
      let slug = slugBase;
      const clash = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
      if (clash) slug = `${slugBase}-${itemId.toLowerCase()}`;
      await prisma.product.create({
        data: {
          ...data,
          itemId,
          sku: `SKU-${itemId}`,
          slug,
          images: { create: images },
        },
      });
      console.log(`created ${itemId} ${item.name}`);
    }

    report.push({
      itemId,
      key: item.key,
      name: item.name,
      brandModel: item.brandModel,
      condition: item.condition,
      supplierRef: item.supplierRef,
      sourceCostCents: item.sourceCostCents,
      costNote: item.costNote,
      markup: "not applied",
      sellingPriceCents: 0,
      shipping: shippingNote,
      customerTotal: "not calculated — selling price is not set",
      weightGrams: item.weightGrams,
      weightNote: item.weightNote,
      category: item.categorySlug,
      testing: "Testing required",
      checklist: item.checklist,
      images: images.map((image) => image.url),
      status: "DRAFT",
    });
  }

  const inventory = {
    private: true,
    note: "Acquisition costs in this file are internal. Do not publish it.",
    drafts: report,
    notImported: NOT_IMPORTED,
  };
  const outDir = join(process.cwd(), "data", "internal");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "ezpawn-intake.json"), JSON.stringify(inventory, null, 2));
  console.log(`wrote ${report.length} draft records`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
