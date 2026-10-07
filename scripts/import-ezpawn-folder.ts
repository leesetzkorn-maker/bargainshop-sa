/**
 * Second EZ Pawn photo pass. Originals are not modified.
 * New rows stay DRAFT. Shop prices stay in sourceCostCents / supplierNotes.
 *
 * Run: npx tsx scripts/import-ezpawn-folder.ts
 */

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { formatItemNumber, nextItemNumberSuggestion } from "../src/lib/enums";
import { parsePricingTiers, sellingPriceFromCost, tierForCost, type PricingSettings } from "../src/lib/pricing";
import { excerpt, slugify } from "../src/lib/utils";

const prisma = new PrismaClient();
const ROOT = "C:\\Users\\leese\\Desktop\\ez pawn";
const UPLOADS = join(process.cwd(), "public", "uploads", "products");
const CROPS = "C:\\Users\\leese\\AppData\\Local\\Temp\\ez-crops";
const TESTED = "Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.";
const WEIGH = "Weight and parcel size were not measured. Needs weighing before a delivery price. Locker delivery is not promised.";
const HEAVY = "Large or heavy. Needs weighing and measuring. Locker delivery is not promised. Flagged for shipping review.";

interface Shot {
  file: string;
  alt: string;
}

interface Item {
  key: string;
  name: string;
  brandModel: string;
  categorySlug: string;
  conditionNote: string;
  description: string;
  sourceCostCents: number | null;
  costNote: string;
  supplierRef: string;
  shots: Shot[];
  shippingFlag: string;
  checklist: string[];
}

const f = (name: string) => join(ROOT, name);

const ITEMS: Item[] = [
  {
    key: "ingco-20v-drill",
    name: "Ingco 20V cordless drill with charger and battery",
    brandModel: "Ingco lithium-ion cordless drill, 20V, 4.0Ah battery, shop ref S029310A",
    categorySlug: "battery-drills",
    conditionNote: "Used — scuffs and dirt on the housing. Tested and confirmed working before listing.",
    description: `A used Ingco 20V cordless drill with a 4.0Ah battery and charger. Scuffs and dirt are visible on the housing. ${TESTED}`,
    sourceCostCents: 69500,
    costNote: "Tag on this drill: Ingco cordless drill with charger and battery, R695.00, ref S029310A.",
    supplierRef: "S029310A",
    shots: [
      { file: f("IMG-20260928-WA0003.jpg"), alt: "Used Ingco 20V cordless drill with a 4.0Ah battery" },
      { file: f("IMG-20260928-WA0005.jpg"), alt: "Side of the same used Ingco 20V cordless drill" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Chuck opens and closes", "Trigger and direction switch", "Battery clicks in", "Charger included"],
  },
  {
    key: "yellow-polisher",
    name: "Yellow cordless polisher with pad and battery",
    brandModel: "Yellow cordless polisher. Brand was not readable on this photo.",
    categorySlug: "car-accessories",
    conditionNote: "Used — dirt on the housing. Tested and confirmed working before listing.",
    description: `A used yellow cordless polisher with a round pad, battery and lead. Dirt is visible on the yellow housing. The brand was not readable. ${TESTED}`,
    sourceCostCents: null,
    costNote: "No readable shop price on this photo. Do not invent a cost.",
    supplierRef: "none readable",
    shots: [{ file: f("IMG-20260928-WA0030.jpg"), alt: "Used yellow cordless polisher with a pad and battery on a concrete floor" }],
    shippingFlag: WEIGH,
    checklist: ["Pad is fitted", "Battery clicks in", "Trigger"],
  },
  {
    key: "black-decker-drill",
    name: "Black & Decker cordless drill with charger",
    brandModel: "Black & Decker cordless drill with charger, shop ref S026549A",
    categorySlug: "battery-drills",
    conditionNote: "Used — scuffs on the red housing. Tested and confirmed working before listing.",
    description: `A used red and black Black & Decker cordless drill with a charger lead. Scuffs are visible on the housing. A tag on a different drill in the background was not used for this listing. ${TESTED}`,
    sourceCostCents: 39500,
    costNote: "Tag on this drill's battery: Black & Decker cordless drill with charger, R395.00, ref S026549A. A nearby tag for R1,495 belongs to another drill.",
    supplierRef: "S026549A",
    shots: [{ file: f("IMG-20260928-WA0032.jpg"), alt: "Used red Black and Decker cordless drill with a charger lead" }],
    shippingFlag: WEIGH,
    checklist: ["Chuck", "Trigger", "Battery seats", "Charger lead included"],
  },
  {
    key: "ryobi-cordless-drill-s025108a",
    name: "Ryobi cordless drill with charger",
    brandModel: "Ryobi cordless drill with charger, shop ref S025108A",
    categorySlug: "battery-drills",
    conditionNote: "Used — scuffs and a crack in the housing near the handle. Tested and confirmed working before listing.",
    description: `A used teal Ryobi cordless drill with a battery and charger. Scuffs are visible, and the housing is cracked near the handle. ${TESTED}`,
    sourceCostCents: 59500,
    costNote: "Tag on this drill: Ryobi cordless drill with charger, R595.00, ref S025108A.",
    supplierRef: "S025108A",
    shots: [{ file: f("IMG-20260928-WA0034.jpg"), alt: "Used teal Ryobi cordless drill with scuffs and a cracked housing" }],
    shippingFlag: WEIGH,
    checklist: ["Chuck and torque collar", "Trigger", "Battery", "Charger"],
  },
  {
    key: "tork-craft-grinder",
    name: "Tork Craft 20V angle grinder with battery and charger",
    brandModel: "Tork Craft 20V angle grinder, 4.0Ah battery and charger, shop ref S027816A",
    categorySlug: "grinders",
    conditionNote: "Used — scuffs and dirt. Tested and confirmed working before listing.",
    description: `A used Tork Craft 20V angle grinder with a side handle, 4.0Ah battery and charger. Scuffs and dirt are visible. No cutting disc is fitted in the photo. ${TESTED}`,
    sourceCostCents: 89500,
    costNote: "Tags on the charger and the battery both read R895.00 for this grinder kit, ref S027816A.",
    supplierRef: "S027816A",
    shots: [{ file: f("IMG-20260928-WA0036.jpg"), alt: "Used Tork Craft 20V angle grinder with battery and charger" }],
    shippingFlag: WEIGH,
    checklist: ["Guard and side handle", "Battery", "Charger", "Spindle turns"],
  },
  {
    key: "ingco-mini-grinder",
    name: "Ingco 20V 76mm mini angle grinder",
    brandModel: "Ingco CAGLI7601 20V mini cut-off tool, 76mm, 2.0Ah battery. Serial 23101890285.",
    categorySlug: "grinders",
    conditionNote: "Used — dust, scuffs and paint wear. Tested and confirmed working before listing.",
    description: `A used Ingco 20V mini angle grinder, about 76mm, with a 2.0Ah battery and a charging lead. Dust, scuffs and worn paint are visible. No disc is fitted. ${TESTED}`,
    sourceCostCents: null,
    costNote: "No shop price tag on these three photos. Do not invent a cost.",
    supplierRef: "none readable",
    shots: [
      { file: f("IMG-20260928-WA0038.jpg"), alt: "Used Ingco 20V mini angle grinder with a guard and battery" },
      { file: f("IMG-20260928-WA0040.jpg"), alt: "Top of the same Ingco mini grinder showing the 2.0Ah battery" },
      { file: f("IMG-20260928-WA0042.jpg"), alt: "Specification label on the same Ingco mini grinder" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Guard", "Battery", "Switch", "Spindle"],
  },
  {
    key: "aeg-bse96",
    name: "AEG BSE 9.6 cordless drill",
    brandModel: "AEG BSE 9.6 cordless drill, 9.6V, shop ref S025128A",
    categorySlug: "battery-drills",
    conditionNote: "Used — scuffs, dirt and a chip in the housing. Tested and confirmed working before listing.",
    description: `A used teal AEG BSE 9.6 cordless drill with its battery pack. Scuffs, dirt and a small chip in the housing are visible. ${TESTED}`,
    sourceCostCents: 45000,
    costNote: "Tag on this drill: AEG cordless drill, R450.00, ref S025128A.",
    supplierRef: "S025128A",
    shots: [
      { file: f("IMG-20260928-WA0044.jpg"), alt: "Used teal AEG BSE 9.6 cordless drill" },
      { file: f("IMG-20260928-WA0046.jpg"), alt: "Specification plate on the same AEG BSE 9.6 drill" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Chuck", "Orange trigger", "Battery pack"],
  },
  {
    key: "steco-powerstation",
    name: "Steco 1000W power station with charger",
    brandModel: "Steco 1000W power station, pure sine wave, shop ref S029437A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — light scuffs on the casing. Tested and confirmed working before listing.",
    description: `A used Steco 1000W power station with AC sockets, USB ports and a DC outlet. Light scuffs are visible on the black casing. The shop tag says a charger is included. ${TESTED}`,
    sourceCostCents: 195000,
    costNote: "Tag on this unit: Steco 1000W powerstation with charger, R1,950.00, ref S029437A.",
    supplierRef: "S029437A",
    shots: [
      { file: f("IMG-20260928-WA0048.jpg"), alt: "Front of a used Steco 1000W power station" },
      { file: f("IMG-20260928-WA0050.jpg"), alt: "Shop tag and AC outlet on the same Steco power station" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Display", "AC outlets", "USB ports", "Charger"],
  },
  {
    key: "ryobi-pressure-washer",
    name: "Ryobi AJP-1480 high pressure washer",
    brandModel: "Ryobi high pressure washer AJP-1480, shop ref S027944A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — dirt on the housing and hose. Tested and confirmed working before listing.",
    description: `A used Ryobi high pressure washer, model AJP-1480, with the hose wrapped on the body. Dirt is visible. ${TESTED}`,
    sourceCostCents: 89500,
    costNote: "Tag on this washer: Ryobi pressure washer, R895.00, ref S027944A.",
    supplierRef: "S027944A",
    shots: [{ file: f("IMG-20260928-WA0052.jpg"), alt: "Used Ryobi high pressure washer with the hose wrapped around it" }],
    shippingFlag: HEAVY,
    checklist: ["Hose", "Gun and lance", "Power lead", "Leaks"],
  },
  {
    key: "ryobi-circular-saw",
    name: "Ryobi circular saw",
    brandModel: "Ryobi circular saw, shop ref S028038A",
    categorySlug: "power-tools",
    conditionNote: "Used — dust, scuffs and a worn sole plate. Tested and confirmed working before listing.",
    description: `A used Ryobi circular saw with a dusty guard and a worn sole plate. A price tag in the background belongs to another item and is not this saw's price. ${TESTED}`,
    sourceCostCents: 45000,
    costNote: "Tag on this saw: Ryobi circular saw, R450.00, ref S028038A. A background tag of R395 belongs to another item.",
    supplierRef: "S028038A",
    shots: [{ file: f("IMG-20260928-WA0054.jpg"), alt: "Used dusty Ryobi circular saw" }],
    shippingFlag: HEAVY,
    checklist: ["Guard moves", "Blade is fitted", "Base plate", "Power lead"],
  },
  {
    key: "ryobi-heat-gun",
    name: "Ryobi HG-2000 heat gun",
    brandModel: "Ryobi HG-2000, 2000W, serial 104700073, shop ref S024467A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — scuffs and paint chips. Tested and confirmed working before listing.",
    description: `A used blue Ryobi heat gun, model HG-2000. Scuffs and paint chips are visible on the housing. ${TESTED}`,
    sourceCostCents: null,
    costNote: "Shop ref S024467A is on the tool, but the price on that tag was not clear enough to record. Do not invent a cost.",
    supplierRef: "S024467A",
    shots: [
      { file: f("IMG-20260928-WA0056.jpg"), alt: "Handle of a used blue Ryobi heat gun" },
      { file: f("IMG-20260928-WA0058.jpg"), alt: "Specification label on the same Ryobi HG-2000 heat gun" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Nozzle", "Switch", "Power lead"],
  },
  {
    key: "ryobi-hid10",
    name: "Ryobi HID-10 hammer drill",
    brandModel: "Ryobi hammer drill HID-10, shop ref S026920A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — heavy dirt and scuffs. Tested and confirmed working before listing.",
    description: `A used Ryobi HID-10 corded hammer drill. The housing is dirty and scuffed. Other tools in the same photo are not included. ${TESTED}`,
    sourceCostCents: 29500,
    costNote: "Tag on this drill: Ryobi drill HID-10, R295.00, ref S026920A.",
    supplierRef: "S026920A",
    shots: [
      { file: f("IMG-20260928-WA0060.jpg"), alt: "Chuck end of a used dirty Ryobi hammer drill" },
      { file: f("IMG-20260928-WA0062.jpg"), alt: "Handle and shop tag on the same Ryobi HID-10 drill" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Chuck", "Hammer selector", "Trigger", "Power lead"],
  },
  {
    key: "stramm-sander",
    name: "Stramm sheet sander",
    brandModel: "Stramm sheet sander, 135W, 90x187mm pad, shop ref S025244A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — dust and scuffs. Tested and confirmed working before listing.",
    description: `A used teal Stramm sheet sander with a rectangular pad and a wrapped power lead. Dust and scuffs are visible. ${TESTED}`,
    sourceCostCents: 18000,
    costNote: "Tag on this sander: Stramm sander, R180.00, ref S025244A.",
    supplierRef: "S025244A",
    shots: [
      { file: f("IMG-20260928-WA0070.jpg"), alt: "Used teal Stramm sheet sander with the lead wrapped around it" },
      { file: f("IMG-20260928-WA0068.jpg"), alt: "Specification label on the same Stramm sander" },
      { file: f("IMG-20260928-WA0065.jpg"), alt: "Handle of the same Stramm sander" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Pad", "Switch", "Dust", "Power lead"],
  },
  {
    key: "red-rhino-rtd20v",
    name: "Red Rhino RT-D20V cordless drill with battery and charger",
    brandModel: "Red Rhino RT-D20V 20V impact drill, battery and charger, shop ref S029860A",
    categorySlug: "battery-drills",
    conditionNote: "Used — the box is torn. Tested and confirmed working before listing.",
    description: `A used Red Rhino 20V cordless drill, model RT-D20V, in a torn box with a battery and charger. The box front is ripped. ${TESTED}`,
    sourceCostCents: 49500,
    costNote: "Tag on the box and on the battery: cordless drill with battery and charger, R495.00, ref S029860A.",
    supplierRef: "S029860A",
    shots: [
      { file: f("IMG-20260928-WA0075.jpg"), alt: "Red Rhino cordless drill, battery and charger in an open box" },
      { file: f("IMG-20260928-WA0073.jpg"), alt: "Torn box for the same Red Rhino RT-D20V drill" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Chuck", "Battery", "Charger", "Box contents"],
  },
  {
    key: "ingco-welder-180",
    name: "Ingco 180A inverter welder with cables",
    brandModel: "Ingco ING-MMA18059N, serial 25362000151, shop ref S029227A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — scuffs and tape on the casing. Tested and confirmed working before listing.",
    description: `A used Ingco 180A inverter MMA welder with an earth clamp, electrode holder and leads. Scuffs and a piece of tape are visible on the yellow casing. A different welder box in the background is not included. ${TESTED}`,
    sourceCostCents: 129500,
    costNote: "Tag on this welder: Ingco 180A inverter welding machine with cables, R1,295.00, ref S029227A.",
    supplierRef: "S029227A",
    shots: [
      { file: f("IMG-20260928-WA0079.jpg"), alt: "Used Ingco 180A welder with clamp and leads" },
      { file: f("IMG-20260928-WA0077.jpg"), alt: "Side of the same Ingco 180A welder" },
      { file: f("IMG-20260928-WA0081.jpg"), alt: "Specification plate on the same Ingco welder" },
      { file: f("IMG-20260928-WA0083.jpg"), alt: "Shop tag on the same Ingco welder" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Clamp and holder", "Leads", "Current knob", "Fan"],
  },
  {
    key: "ryobi-ed500",
    name: "Ryobi ED-500 rotary hammer in case",
    brandModel: "Ryobi ED-500 rotary hammer in a case. Shop price R795. Full reference number was not readable.",
    categorySlug: "electrical-tools",
    conditionNote: "Used — dirt and scuffs. Tested and confirmed working before listing.",
    description: `A used Ryobi ED-500 rotary hammer in a black carry case, with its power lead. The body is dirty and scuffed. This is not the larger Ryobi hammer drill in the other case. ${TESTED}`,
    sourceCostCents: 79500,
    costNote: "Tag on this hammer: hammer drill in case, R795.00. The full shop reference was not readable.",
    supplierRef: "not fully read",
    shots: [
      { file: f("IMG-20260928-WA0087.jpg"), alt: "Used Ryobi ED-500 rotary hammer in an open case" },
      { file: f("IMG-20260928-WA0085.jpg"), alt: "The same Ryobi rotary hammer standing in its case" },
      { file: f("IMG-20260928-WA0089.jpg"), alt: "Handle of the same Ryobi ED-500 rotary hammer" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Chuck", "Case", "Power lead", "Mode selector"],
  },
  {
    key: "ryobi-hammer-s028440a",
    name: "Ryobi hammer drill in case",
    brandModel: "Ryobi hammer drill in case, shop ref S028440A. Larger unit than the ED-500.",
    categorySlug: "electrical-tools",
    conditionNote: "Used — heavy dirt, worn paint and a scuffed case. Tested and confirmed working before listing.",
    description: `A used Ryobi hammer drill in a black case, with a side handle and drill bits in the case. Paint is worn and the tool is dirty. ${TESTED}`,
    sourceCostCents: 79500,
    costNote: "Tag on the case: Ryobi hammer drill in case, R795.00, ref S028440A. The same price is on the tool.",
    supplierRef: "S028440A",
    shots: [
      { file: f("IMG-20260928-WA0091.jpg"), alt: "Used Ryobi hammer drill with bits in an open case" },
      { file: f("IMG-20260928-WA0093.jpg"), alt: "Closed case of the same Ryobi hammer drill" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Side handle", "Bits", "Case", "Power lead"],
  },
  {
    key: "bosch-drill-kit",
    name: "Bosch cordless drill with extra battery and charger",
    brandModel: "Bosch cordless drill in case with extra battery and charger, shop ref S027151A",
    categorySlug: "battery-drills",
    conditionNote: "Used — scuffs on the drill and wear on the case. Tested and confirmed working before listing.",
    description: `A used Bosch cordless drill in a case, with a charger, an extra battery and a chuck key. The drill and case are scuffed. ${TESTED}`,
    sourceCostCents: 59500,
    costNote: "Tag on the charger and on the drill: Bosch cordless drill with extra battery and charger in case, R595.00, ref S027151A.",
    supplierRef: "S027151A",
    shots: [
      { file: f("IMG-20260928-WA0095.jpg"), alt: "Used Bosch cordless drill with charger and extra battery in a case" },
      { file: f("IMG-20260928-WA0097.jpg"), alt: "Charger in the same Bosch drill case" },
      { file: f("IMG-20260928-WA0099.jpg"), alt: "Closed Bosch case for the same drill kit" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Drill", "Two batteries", "Charger", "Chuck key", "Case"],
  },
  {
    key: "mac-africa-welder",
    name: "Mac Africa welding machine with leads",
    brandModel: "Mac Africa welding machine, shop ref S027733A",
    categorySlug: "electrical-tools",
    conditionNote: "Used — paint chips and dirt. Tested and confirmed working before listing.",
    description: `A used blue Mac Africa welding machine with a power lead and a red electrode holder. Paint chips and dirt are visible. ${TESTED}`,
    sourceCostCents: 79500,
    costNote: "Tag on this machine: Mac Africa welding machine, R795.00, ref S027733A.",
    supplierRef: "S027733A",
    shots: [{ file: f("IMG-20260928-WA0101.jpg"), alt: "Used blue Mac Africa welding machine with a red electrode holder" }],
    shippingFlag: HEAVY,
    checklist: ["Holder and clamp", "Leads", "Handle", "Casing"],
  },
  {
    key: "harden-77-toolbox",
    name: "Harden 77 piece toolbox",
    brandModel: "Harden 77 piece toolbox, shop ref S025666A",
    categorySlug: "toolboxes",
    conditionNote: "Used — the case is scuffed. Tested and confirmed working before listing.",
    description: `A used Harden toolbox opened to show sockets, spanners, screwdrivers, pliers and hex keys in foam trays. The case is scuffed. The printed shop price and a handwritten price on the same sticker do not agree, so no selling price is shown yet. ${TESTED}`,
    sourceCostCents: null,
    costNote: "Same sticker shows a printed R2,950.00 and a handwritten R1400. Conflicting. Do not pick one.",
    supplierRef: "S025666A",
    shots: [
      { file: f("IMG-20260928-WA0103.jpg"), alt: "Open Harden toolbox showing the tools in foam trays" },
      { file: f("IMG-20260928-WA0105.jpg"), alt: "Shop sticker on the same Harden toolbox" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Case latches", "Trays", "Sockets and spanners present as photographed"],
  },
  {
    key: "grip-toolbox",
    name: "Grip toolbox with tools",
    brandModel: "Grip toolbox with tools, shop ref S029378A",
    categorySlug: "toolboxes",
    conditionNote: "Used — the case is scuffed. Tested and confirmed working before listing.",
    description: `A used Grip toolbox opened to show spanners, pliers, hex keys and a socket set in foam. The case is scuffed. ${TESTED}`,
    sourceCostCents: 79500,
    costNote: "Tag on this box: Grip tool box with complete tools, R795.00, ref S029378A.",
    supplierRef: "S029378A",
    shots: [
      { file: f("IMG-20260928-WA0107.jpg"), alt: "Open Grip toolbox with spanners, pliers and sockets" },
      { file: f("IMG-20260928-WA0109.jpg"), alt: "Shop tag on the same Grip toolbox" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Case", "Foam trays", "Tools seated as photographed"],
  },
  {
    key: "yohe-helmet-l",
    name: "Yohe motorcycle helmet, size L",
    brandModel: "Yohe bike helmet, size L, shop ref S029164A",
    categorySlug: "other-bargains",
    conditionNote: "Used — scratches on the shell and marks on the visor. Tested and confirmed working before listing.",
    description: `A used Yohe full-face motorcycle helmet, size L, white with orange, blue and black graphics. Scratches are visible on the shell and there are marks on the visor. Other helmets in the background are not included. ${TESTED}`,
    sourceCostCents: 49500,
    costNote: "Tag on this helmet: Yohe bike helmet size L, R495.00, ref S029164A.",
    supplierRef: "S029164A",
    shots: [
      { file: f("IMG-20260928-WA0111.jpg"), alt: "Front of a used Yohe size L motorcycle helmet" },
      { file: f("IMG-20260928-WA0113.jpg"), alt: "Top of the same used Yohe helmet showing scratches" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Visor opens", "Strap", "Liner", "Shell cracks"],
  },
  {
    key: "grey-rs-helmet",
    name: "Grey motorcycle helmet",
    brandModel: "Grey full-face motorcycle helmet. A brand mark is on the shell. No readable shop tag.",
    categorySlug: "other-bargains",
    conditionNote: "Used — light marks on the shell. Tested and confirmed working before listing.",
    description: `A used grey full-face motorcycle helmet with a clear visor and a black vent. Light marks are visible on the shell. No shop price was readable on this helmet. ${TESTED}`,
    sourceCostCents: null,
    costNote: "No price tag on these two photos. Do not use a tag from a neighbouring helmet.",
    supplierRef: "none readable",
    shots: [
      { file: f("IMG-20260928-WA0115.jpg"), alt: "Front of a used grey motorcycle helmet" },
      { file: f("IMG-20260928-WA0117.jpg"), alt: "Side of the same grey motorcycle helmet" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Visor", "Strap", "Shell"],
  },
  {
    key: "green-graphic-helmet",
    name: "Green graphic motorcycle helmet",
    brandModel: "Green full-face helmet with a cartoon graphic. No tag was on this helmet.",
    categorySlug: "other-bargains",
    conditionNote: "Used — scuffs and visor marks. Tested and confirmed working before listing.",
    description: `A used green and yellow full-face motorcycle helmet with a cartoon graphic, a clear visor and a green vent. Scuffs and marks on the visor are visible. A price tag beside other helmets was not on this one, so no price is shown. ${TESTED}`,
    sourceCostCents: null,
    costNote: "No tag attached to this helmet. Nearby tags belong to other helmets.",
    supplierRef: "none",
    shots: [{ file: f("IMG-20260928-WA0119.jpg"), alt: "Used green graphic motorcycle helmet" }],
    shippingFlag: WEIGH,
    checklist: ["Visor", "Strap", "Shell"],
  },
  {
    key: "offroad-helmet-s028816a",
    name: "Black off-road motorcycle helmet",
    brandModel: "Off-road bike helmet, shop ref S028816A. Monster Energy and FMF graphics.",
    categorySlug: "other-bargains",
    conditionNote: "Used — scratches on the peak and shell. Tested and confirmed working before listing.",
    description: `A used black off-road motorcycle helmet with a peak and white graphics. Scratches are visible on the peak and shell. The shop tag says glasses are included, but glasses are not clearly visible in the photo. ${TESTED}`,
    sourceCostCents: 39500,
    costNote: "Tag on this helmet: one offroad bike helmet with glasses, R395.00, ref S028816A. A separate R395 tag in the pile belongs to another helmet.",
    supplierRef: "S028816A",
    shots: [{ file: f("IMG-20260928-WA0121.jpg"), alt: "Used black off-road motorcycle helmet with a scratched peak" }],
    shippingFlag: WEIGH,
    checklist: ["Peak", "Visor", "Strap", "Shell"],
  },
  {
    key: "vega-helmet-xl",
    name: "Vega motorcycle helmet, size XL",
    brandModel: "Vega bike helmet, size XL, shop ref S028753A",
    categorySlug: "other-bargains",
    conditionNote: "Used — scuffs on the shell. Tested and confirmed working before listing.",
    description: `A used Vega full-face motorcycle helmet, size XL, in orange fading to black, with a clear visor. Scuffs are visible on the shell. ${TESTED}`,
    sourceCostCents: 39500,
    costNote: "Tag on this helmet: Vega bike helmet size XL, R395.00, ref S028753A.",
    supplierRef: "S028753A",
    shots: [{ file: f("IMG-20260928-WA0123.jpg"), alt: "Used orange and black Vega size XL motorcycle helmet" }],
    shippingFlag: WEIGH,
    checklist: ["Visor", "Strap", "Shell"],
  },
  {
    key: "black-graphic-helmet",
    name: "Black motorcycle helmet",
    brandModel: "Black full-face bike helmet with a grey block graphic, shop ref S028573E",
    categorySlug: "other-bargains",
    conditionNote: "Used — scuffs on the shell. Tested and confirmed working before listing.",
    description: `A used black full-face motorcycle helmet with a grey block graphic and a dark visor. Scuffs are visible on the shell. ${TESTED}`,
    sourceCostCents: 39500,
    costNote: "Tag on this helmet: bike helmet, R395.00, ref S028573E.",
    supplierRef: "S028573E",
    shots: [{ file: f("IMG-20260928-WA0125.jpg"), alt: "Used black motorcycle helmet with a grey graphic" }],
    shippingFlag: WEIGH,
    checklist: ["Visor", "Strap", "Shell"],
  },
  {
    key: "silver-crest-fryer",
    name: "Silver Crest air fryer",
    brandModel: "Silver Crest air fryer, shop ref S029536A",
    categorySlug: "air-fryers",
    conditionNote: "Used — the coating is peeling on the front. Tested and confirmed working before listing.",
    description: `A used black Silver Crest air fryer with a gold-coloured handle and lid rim. The coating is peeling on the front. A price tag on a different fryer behind it was not used. ${TESTED}`,
    sourceCostCents: 39500,
    costNote: "Tag on this fryer's handle: Silver Crest air fryer, R395.00, ref S029536A. A background tag of R495 belongs to another fryer.",
    supplierRef: "S029536A",
    shots: [{ file: f("IMG-20260928-WA0127.jpg"), alt: "Used black Silver Crest air fryer with peeling coating on the front" }],
    shippingFlag: WEIGH,
    checklist: ["Basket", "Handle", "Controls", "Power lead"],
  },
  {
    key: "goldair-fryer",
    name: "Goldair air fryer",
    brandModel: "Goldair air fryer, shop ref S026852A",
    categorySlug: "air-fryers",
    conditionNote: "Used — a white chip on the front panel. Tested and confirmed working before listing.",
    description: `A used black Goldair air fryer with a silver handle. A white chip is visible on the front panel. ${TESTED}`,
    sourceCostCents: 20000,
    costNote: "Owner confirmed the shop price is R200. The printed R395 on the tag is not the cost. Ref S026852A.",
    supplierRef: "S026852A",
    shots: [{ file: f("IMG-20260928-WA0129.jpg"), alt: "Used black Goldair air fryer with a white chip on the front" }],
    shippingFlag: WEIGH,
    checklist: ["Basket", "Handle", "Display", "Power lead"],
  },
  {
    key: "oneal-kids-boots",
    name: "O'Neal kids motorbike boots",
    brandModel: "O'Neal kids bike boots, a pair. Left tag ref S025987J.",
    categorySlug: "other-bargains",
    conditionNote: "Used — scuffs and worn soles. Tested and confirmed working before listing.",
    description: `A used pair of black O'Neal kids motorbike boots. The logos are scuffed and the soles are worn. Both boots have a shop tag. It is not clear whether the printed price is for one boot or the pair, so no selling price is shown yet. ${TESTED}`,
    sourceCostCents: null,
    costNote: "Both boots are tagged O'Neal kids bike boots at R295.00. Left ref reads S025987J. It is not clear if R295 is each boot or the pair. Do not invent a cost.",
    supplierRef: "S025987J",
    shots: [{ file: f("IMG-20260928-WA0131.jpg"), alt: "Used pair of black O'Neal kids motorbike boots" }],
    shippingFlag: WEIGH,
    checklist: ["Pair", "Buckles", "Soles", "Liners"],
  },
  {
    key: "petrol-chainsaw-s028376a",
    name: "Red petrol chainsaw",
    brandModel: "Petrol chainsaw, shop ref S028376A. A second saw beside it is not this item.",
    categorySlug: "power-tools",
    conditionNote: "Used — scuffs on the housing. Tested and confirmed working before listing.",
    description: `A used red and black petrol chainsaw with a rear handle, chain brake and a bar. Scuffs are visible. The red and silver saw beside it is a different item and is not included. ${TESTED}`,
    sourceCostCents: 89500,
    costNote: "Tag on this saw: petrol chainsaw, R895.00, ref S028376A.",
    supplierRef: "S028376A",
    shots: [
      { file: f("IMG-20260928-WA0133.jpg"), alt: "Rear of a used red petrol chainsaw" },
      { file: f("IMG-20260928-WA0135.jpg"), alt: "Shop tag and warning labels on the same red petrol chainsaw" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Chain and bar", "Chain brake", "Pull start", "Fuel and oil caps"],
  },
  {
    key: "blue-pressure-washer",
    name: "Blue high pressure washer",
    brandModel: "Blue and black high pressure washer with lance and gun. Brand and price were not readable.",
    categorySlug: "electrical-tools",
    conditionNote: "Used — dirt and scuffs. Tested and confirmed working before listing.",
    description: `A used blue and black high pressure washer with the hose wrapped around it, a lance and gun, and a second view of the motor housing and power lead. Dirt and scuffs are visible. This is not the Ryobi washer. ${TESTED}`,
    sourceCostCents: 69500,
    costNote: "The close-up and the full machine are the same washer. Shop tag on the motor housing reads R695.00, ref S029376A. The tag called it a pool pump; the owner confirmed it is this blue high pressure washer.",
    supplierRef: "S029376A",
    shots: [
      { file: f("IMG-20260928-WA0139.jpg"), alt: "Used blue high pressure washer with hose, lance and gun" },
      { file: f("IMG-20260928-WA0137.jpg"), alt: "Motor housing and power lead of the same blue high pressure washer" },
    ],
    shippingFlag: HEAVY,
    checklist: ["Hose", "Lance and gun", "Power lead"],
  },
  {
    key: "green-bench-grinder",
    name: "Heavy duty bench grinder",
    brandModel: "Heavy duty bench grinder, plate model G-150, 230V, shop ref S026686A",
    categorySlug: "grinders",
    conditionNote: "Used — dust, rust and worn wheels. Tested and confirmed working before listing.",
    description: `A used green heavy duty bench grinder with two wheels and eye shields. Dust and wear are visible. Cropped from a group photo so the neighbouring machines are not sold with it. ${TESTED}`,
    sourceCostCents: 49500,
    costNote: "Tag on this grinder: heavy duty bench grinder, R495.00, ref S026686A.",
    supplierRef: "S026686A",
    shots: [{ file: join(CROPS, "grinder-green.jpg"), alt: "Used green heavy duty bench grinder with two wheels" }],
    shippingFlag: HEAVY,
    checklist: ["Both wheels", "Guards", "Switch", "Tool rests"],
  },
  {
    key: "silver-bench-grinder",
    name: "Silver bench grinder",
    brandModel: "Bench grinder, shop ref read as S010522A on the tag attached to this machine",
    categorySlug: "grinders",
    conditionNote: "Used — rust and worn paint. Tested and confirmed working before listing.",
    description: `A used silver bench grinder with rusty end covers and worn paint. Cropped from a group photo. ${TESTED}`,
    sourceCostCents: 49500,
    costNote: "Tag on this grinder reads bench grinder, R495.00. The reference was read as S010522A from the tag on this machine.",
    supplierRef: "S010522A",
    shots: [{ file: join(CROPS, "grinder-silver.jpg"), alt: "Used rusty silver bench grinder" }],
    shippingFlag: HEAVY,
    checklist: ["Wheels", "Guards", "Switch"],
  },
  {
    key: "toyang-ty1068",
    name: "Toyang TY1068 bench grinder",
    brandModel: "Toyang bench grinder TY1068, 1/4 hp, shop ref S027095A",
    categorySlug: "grinders",
    conditionNote: "Used — dust and scuffs. Tested and confirmed working before listing.",
    description: `A used yellow Toyang TY1068 bench grinder with a wheel guard and an eye shield. Dust and scuffs are visible. Cropped from a group photo. ${TESTED}`,
    sourceCostCents: 49500,
    costNote: "Tag on this grinder: Toyang bench grinder TY1068, R495.00, ref S027095A.",
    supplierRef: "S027095A",
    shots: [{ file: join(CROPS, "grinder-yellow.jpg"), alt: "Used yellow Toyang TY1068 bench grinder" }],
    shippingFlag: HEAVY,
    checklist: ["Wheel", "Guard", "Eye shield", "Switch"],
  },
  {
    key: "dca-ratchet",
    name: "DCA 12V cordless ratchet wrench",
    brandModel: "DCA 12V cordless brushless ratchet wrench, shop ref S028915A",
    categorySlug: "power-tools",
    conditionNote: "Used — light marks. Tested and confirmed working before listing.",
    description: `A used green and black DCA 12V cordless ratchet wrench, shown on its box. The shop tag says a charger and battery in a bag are included. Those are not clearly visible in this photo. ${TESTED}`,
    sourceCostCents: 139500,
    costNote: "Tag on this wrench: DCA 12V cordless brushless ratchet wrench with charger and battery in bag, R1,395.00, ref S028915A.",
    supplierRef: "S028915A",
    shots: [{ file: f("IMG-20260928-WA0145.jpg"), alt: "Used green DCA 12V cordless ratchet wrench on its box" }],
    shippingFlag: WEIGH,
    checklist: ["Anvil", "Trigger", "Battery and charger if present in the bag"],
  },
  {
    key: "ryobi-18v-impact-kit",
    name: "Ryobi 18V cordless impact drill with charger and three batteries",
    brandModel: "Ryobi 18V cordless impact drill in a bit case, shop ref S029542A. Price on the tag was not readable.",
    categorySlug: "battery-drills",
    conditionNote: "Used — scuffs on the drill and case. Tested and confirmed working before listing.",
    description: `A used Ryobi 18V cordless impact drill in an aluminium bit case, with a charger, three 18V batteries and a set of bits. The drill and case are scuffed. No selling price is shown because the shop price was not readable. ${TESTED}`,
    sourceCostCents: null,
    costNote: "Tag on the drill reads Ryobi cordless impact drill with charger and 3 batteries, ref S029542A. The price was not readable. Do not invent it.",
    supplierRef: "S029542A",
    shots: [
      { file: f("IMG-20260928-WA0149.jpg"), alt: "Open case with a used Ryobi 18V impact drill, three batteries, charger and bits" },
      { file: f("IMG-20260928-WA0147.jpg"), alt: "Closer view of the same Ryobi 18V drill, batteries and charger" },
    ],
    shippingFlag: WEIGH,
    checklist: ["Drill", "Three batteries", "Charger", "Bits", "Case"],
  },
];

function toWebp(source: string, dest: string) {
  const script = [
    "from PIL import Image",
    `im = Image.open(${JSON.stringify(source)}).convert("RGB")`,
    `im.save(${JSON.stringify(dest)}, "WEBP", quality=82, method=6)`,
  ].join("\n");
  const result = spawnSync("python", ["-c", script], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`WebP failed for ${source}\n${result.stderr || result.stdout}`);
}

function cropGrinders() {
  const script = [
    "from PIL import Image",
    "import os",
    `os.makedirs(${JSON.stringify(CROPS)}, exist_ok=True)`,
    `im = Image.open(${JSON.stringify(f("IMG-20260928-WA0141.jpg"))})`,
    "w,h = im.size",
    "bands = {'grinder-green.jpg': (0, 780, w, 2050), 'grinder-silver.jpg': (0, 1850, w, 3050), 'grinder-yellow.jpg': (0, 2700, w, h)}",
    "for name, box in bands.items():",
    `    im.crop(box).save(os.path.join(${JSON.stringify(CROPS)}, name), quality=90)`,
  ].join("\n");
  const result = spawnSync("python", ["-c", script], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

async function settingsFromDb(): Promise<PricingSettings | null> {
  const row = await prisma.pricingSetting.findUnique({ where: { id: 1 } });
  if (!row || !row.isActive) return null;
  const parsed = parsePricingTiers(JSON.parse(row.tiersJson || "[]"));
  return {
    ...row,
    roundingMode: row.roundingMode === "NEAREST" ? "NEAREST" : "UP",
    isActive: row.isActive,
    tiers: parsed.length > 0 ? parsed : [{ minCostCents: 0, belowCostCents: null, markupPercent: row.markupPercent }],
    roundingIncrementCents: row.roundingIncrementCents,
    minPriceCents: row.minPriceCents,
  };
}

async function main() {
  cropGrinders();
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = new Map(categories.map((row) => [row.slug, row.id]));
  const settings = await settingsFromDb();
  const existing = await prisma.product.findMany({ select: { itemId: true } });
  let nextNumber = nextItemNumberSuggestion(existing.map((row) => row.itemId));
  await mkdir(UPLOADS, { recursive: true });

  const intakePath = join(process.cwd(), "data", "internal", "ezpawn-intake.json");
  const intake = JSON.parse(await readFile(intakePath, "utf8")) as {
    private: boolean;
    note: string;
    drafts: Array<Record<string, unknown>>;
  };

  const created: string[] = [];
  for (const item of ITEMS) {
    const marker = `INTAKE ezpawn key=${item.key}`;
    const already = await prisma.product.findFirst({
      where: { supplierNotes: { contains: marker } },
      select: { id: true, itemId: true },
    });
    const itemId = already?.itemId ?? nextNumber;
    if (!already) nextNumber = formatItemNumber(Number.parseInt(itemId.slice(5), 10) + 1);

    const category = categoryId.get(item.categorySlug);
    if (!category) throw new Error(`Missing category ${item.categorySlug}`);

    const slugBase = slugify(item.name);
    let publicSlug = slugBase;
    const images: { url: string; alt: string; sortOrder: number }[] = [];
    for (let index = 0; index < item.shots.length; index += 1) {
      const shot = item.shots[index];
      const filename = `${itemId.toLowerCase()}-${slugBase}${index === 0 ? "" : `-${index + 1}`}.webp`;
      toWebp(shot.file, join(UPLOADS, filename));
      images.push({ url: `/uploads/products/${filename}`, alt: shot.alt, sortOrder: index });
    }

    const selling = item.sourceCostCents != null && settings ? sellingPriceFromCost(item.sourceCostCents, settings) : null;
    const tier = item.sourceCostCents != null && settings ? tierForCost(item.sourceCostCents, settings.tiers) : null;
    const supplierNotes = [
      marker,
      `Brand/model: ${item.brandModel}`,
      `Supplier ref: ${item.supplierRef}`,
      `Cost: ${item.costNote}`,
      selling == null ? "Selling price not calculated. Cost is missing or the markup rule is off." : `Selling price from the saved tier (${tier?.markupPercent}%): ${selling} cents.`,
      `Shipping: ${item.shippingFlag}`,
      "Customer must not see this note.",
    ].join("\n");

    const data = {
      name: item.name,
      description: item.description,
      categoryId: category,
      condition: "USED",
      conditionNote: item.conditionNote,
      testingStatus: "TESTED_AND_WORKING",
      testedAt: new Date("2026-09-28T00:00:00.000Z"),
      priceCents: selling ?? 0,
      sourceCostCents: item.sourceCostCents,
      supplierNotes,
      adminNotes: `Draft from the second shop photo folder. ${item.costNote} ${item.shippingFlag}`,
      productWeightGrams: 0,
      packageWeightGrams: 0,
      packageLengthCm: 0,
      packageWidthCm: 0,
      packageHeightCm: 0,
      stockQty: 1,
      status: "DRAFT" as const,
      isFeatured: false,
    };

    if (already) {
      await prisma.product.update({
        where: { id: already.id },
        data: { ...data, images: { deleteMany: {}, create: images } },
      });
    } else {
      let slug = slugBase;
      const clash = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
      if (clash) slug = `${slugBase}-${itemId.toLowerCase()}`;
      publicSlug = slug;
      await prisma.product.create({
        data: { ...data, itemId, sku: `SKU-${itemId}`, slug, images: { create: images } },
      });
    }

    intake.drafts = intake.drafts.filter((draft) => draft.key !== item.key);
    intake.drafts.push({
      itemId,
      key: item.key,
      name: item.name,
      brandModel: item.brandModel,
      condition: "USED",
      supplierRef: item.supplierRef,
      sourceCostCents: item.sourceCostCents,
      costNote: item.costNote,
      markup: tier ? `${tier.markupPercent}% tier, rounded to the nearest R10` : "not applied — acquisition cost is not confirmed",
      sellingPriceCents: selling ?? 0,
      shipping: item.shippingFlag,
      customerTotal: "not calculated — packed weight and dimensions are not confirmed",
      weightGrams: null,
      weightNote: item.shippingFlag,
      category: item.categorySlug,
      testing: "TESTED & WORKING",
      checklist: item.checklist,
      images: images.map((image) => image.url),
      seoTitle: `${item.name} — second-hand`,
      metaDescription: excerpt(item.description, 155),
      slug: publicSlug,
      status: "DRAFT",
    });
    created.push(`${itemId} ${item.name}`);
    console.log(created[created.length - 1]);
  }

  const frontName = "2ds-0046-redmi-a3x-64gb-smartphone-front.webp";
  toWebp(f("IMG-20260928-WA0153.jpg"), join(UPLOADS, frontName));
  const redmi = await prisma.product.findUnique({
    where: { itemId: "2DS-0046" },
    select: { id: true, images: { orderBy: { sortOrder: "asc" } } },
  });
  if (!redmi) throw new Error("Missing 2DS-0046");
  const frontUrl = `/uploads/products/${frontName}`;
  const alreadyFront = redmi.images.some((image) => image.url === frontUrl);
  if (!alreadyFront) {
    await prisma.productImage.updateMany({ where: { productId: redmi.id }, data: { sortOrder: 1 } });
    await prisma.productImage.create({
      data: {
        productId: redmi.id,
        url: frontUrl,
        alt: "Front of a used Redmi A3X smartphone, switched on",
        sortOrder: 0,
      },
    });
  }
  await prisma.product.update({
    where: { id: redmi.id },
    data: {
      description:
        "A used Redmi A3X, 64GB, black. The front is shown switched on, and the back shows fingerprints and light wear. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
      conditionNote: "Used — fingerprints and light wear on the back. Tested and confirmed working before listing.",
      status: "DRAFT",
    },
  });
  const redmiDraft = intake.drafts.find((draft) => draft.itemId === "2DS-0046");
  if (redmiDraft) {
    const images = Array.isArray(redmiDraft.images) ? (redmiDraft.images as string[]) : [];
    redmiDraft.images = [frontUrl, ...images.filter((url) => url !== frontUrl)];
  }

  await writeFile(intakePath, JSON.stringify(intake, null, 2) + "\n");
  console.log(`CREATED ${created.length}`);
  console.log(created.join("\n"));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
