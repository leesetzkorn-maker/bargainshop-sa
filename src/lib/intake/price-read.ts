/**
 * Reading a retailer price tag from OCR text.
 *
 * Pure string logic: no fs, no sharp, no tesseract. The OCR engine hands over
 * lines of text with a confidence, and this module decides what those lines
 * mean for the store's private source cost.
 *
 * The rule the store asked for, applied literally:
 *
 *   - a printed original price together with a lower reduced price -> the
 *     reduced price is the source cost,
 *   - anything less certain than that is NEVER guessed: the read comes back as
 *     NEEDS_CONFIRMATION and Lee types the number in.
 */

import { MAX_SOURCE_COST_CENTS, MIN_SOURCE_COST_CENTS } from "./constants";

export interface OcrLine {
  text: string;
  /** Tesseract's 0..100 confidence for that line. */
  confidence: number;
}

export interface PriceReading {
  cents: number;
  /** The text the number was found in, for the admin trail. */
  raw: string;
  /** Confidence of the line it came from, 0..100. */
  confidence: number;
}

export type ReadConfidence = "CONFIRMED" | "NEEDS_CONFIRMATION" | "NONE";

export interface PriceRead {
  /** What we paid for the item. Null when nothing could be read. */
  sourceCostCents: number | null;
  /** The top price on the tag — the shop's original asking price. */
  printedPriceCents: number | null;
  /** The reduced (handwritten) price, when two were read. */
  markdownPriceCents: number | null;
  /** Stock / reference number, e.g. "S029164A". */
  stockRef: string | null;
  confidence: ReadConfidence;
  prices: PriceReading[];
  /** Plain-language explanation, shown to Lee in the admin. */
  note: string;
}

/**
 * Turn a raw numeric run into cents.
 *
 * South African tags arrive as "R1 299", "R1,299.00", "1 299", "495,00" —
 * thousands with a space, dot or comma, sometimes with a comma decimal mark.
 * Anything that does not survive as a plain number is refused rather than
 * guessed at.
 */
export function toCents(raw: string): number | null {
  const v = raw.trim().replace(/\s+/g, "");
  if (v === "") return null;

  let normalised: string;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(v)) {
    // "1,299" and "1,299.00" — commas are grouping.
    normalised = v.replace(/,/g, "");
  } else if (
    /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v) &&
    // Without a comma decimal, only a single grouping dot is a price here
    // ("1.299"); "12.345.678" is a quantity or a serial, not a Rand amount.
    (v.includes(",") || v.split(".").length === 2)
  ) {
    // "1.299" and "1.299,00" — dots are grouping, the comma is the decimal.
    normalised = v.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(,\d{1,2})$/.test(v)) {
    // "495,00" — comma decimal mark.
    normalised = v.replace(",", ".");
  } else if (/^\d+(\.\d{1,2})?$/.test(v)) {
    // Plain digits, optionally with a two-decimal tail: "495" or "495.00".
    normalised = v;
  } else {
    // "12.345.678" and friends: not a price format we recognise, so refuse.
    return null;
  }

  const amount = Number(normalised);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

/**
 * Every price mentioned on one line of text.
 *
 * A bare "R" is the strongest signal a tag gives us, so a number without it is
 * only read when it is grouped like a price ("1 299" / "1,299"), which a stock
 * number or a date never is.
 */
export function parsePrices(line: string): PriceReading[] {
  const found: PriceReading[] = [];
  const seen = new Set<number>();

  const push = (raw: string) => {
    const cents = toCents(raw);
    if (cents == null) return;
    if (cents < MIN_SOURCE_COST_CENTS || cents > MAX_SOURCE_COST_CENTS) return;
    if (seen.has(cents)) return;
    seen.add(cents);
    found.push({ cents, raw: raw.trim(), confidence: 100 });
  };

  const randPrefix = /\bR\s?(\d[\d ,.]*\d|\d)/gi;
  for (const match of line.matchAll(randPrefix)) {
    const raw = match[1];
    if (raw) push(raw.replace(/[.,\s]+$/, ""));
  }

  const grouped = /\b(\d{1,3}(?:[ ,]\d{3})+(?:[.,]\d{1,2})?)\b/g;
  for (const match of line.matchAll(grouped)) {
    const raw = match[1];
    if (raw) push(raw);
  }

  return found;
}

/**
 * A stock / reference number such as "S029164A" or "2DS-0081".
 *
 * Requires a letter run in front of at least four digits, which keeps prices
 * and dates out and matches how pawn tickets are actually numbered.
 */
export function parseStockRef(text: string): string | null {
  const match = text.match(
    /\b(?:[A-Z]{1,4}[ -]?\d{4,8}|\d{1,3}[A-Z]{1,3}[ -]?\d{3,8})[ -]?[A-Z]?\b/,
  );
  if (!match?.[0]) return null;
  const cleaned = match[0].replace(/[\s-]/g, "").toUpperCase();
  if (!/[A-Z]/.test(cleaned) || !/\d{4,}/.test(cleaned)) return null;
  // "R1299" is a price written without a space, not a ticket reference.
  if (/^R\d/.test(cleaned)) return null;
  return cleaned;
}

/** Below this line confidence a reading is treated as a guess. */
const CONFIRMED_LINE_CONFIDENCE = 75;

/**
 * Read a tag: prices, stock number, and how much of it can be trusted.
 */
export function readPriceTag(lines: OcrLine[]): PriceRead {
  const prices: PriceReading[] = [];
  const seen = new Set<number>();
  for (const line of lines) {
    const text = line.text ?? "";
    for (const reading of parsePrices(text)) {
      if (seen.has(reading.cents)) continue;
      seen.add(reading.cents);
      prices.push({ ...reading, confidence: Math.round(line.confidence ?? 0) });
    }
  }

  const allText = lines.map((line) => line.text ?? "").join("\n");
  const stockRef = parseStockRef(allText);

  const empty: PriceRead = {
    sourceCostCents: null,
    printedPriceCents: null,
    markdownPriceCents: null,
    stockRef,
    confidence: "NONE",
    prices,
    note: "No price could be read from this photo. Enter the source cost by hand.",
  };

  if (prices.length === 0) return empty;

  const ordered = [...prices].sort((a, b) => b.cents - a.cents);
  const lowestConfidence = Math.min(...ordered.map((price) => price.confidence));

  if (ordered.length === 1) {
    const only = ordered[0]!;
    const confirmed = only.confidence >= CONFIRMED_LINE_CONFIDENCE;
    return {
      sourceCostCents: only.cents,
      printedPriceCents: only.cents,
      markdownPriceCents: null,
      stockRef,
      confidence: confirmed ? "CONFIRMED" : "NEEDS_CONFIRMATION",
      prices,
      note: confirmed
        ? `One price was read clearly: R${(only.cents / 100).toFixed(2)}.`
        : `A price was read but not clearly (confidence ${only.confidence}%). Confirm or correct it — it has not been accepted as-is.`,
    };
  }

  // Two or more distinct prices: the lower one is the reduced price, and the
  // reduced price is what the shop paid for the item.
  const printed = ordered[0]!;
  const markdown = ordered[ordered.length - 1]!;
  const clearlyReduced = markdown.cents <= printed.cents * 0.85;
  const confirmed = clearlyReduced && lowestConfidence >= CONFIRMED_LINE_CONFIDENCE;

  return {
    sourceCostCents: markdown.cents,
    printedPriceCents: printed.cents,
    markdownPriceCents: markdown.cents,
    stockRef,
    confidence: confirmed ? "CONFIRMED" : "NEEDS_CONFIRMATION",
    prices,
    note: confirmed
      ? `Original R${(printed.cents / 100).toFixed(2)}, reduced to R${(markdown.cents / 100).toFixed(2)} — the reduced price is used as the source cost.`
      : `Two prices were seen (R${(printed.cents / 100).toFixed(2)} and R${(markdown.cents / 100).toFixed(2)}) but the reading is not clear enough to trust. Confirm or correct the source cost.`,
  };
}

const CONFIDENCE_RANK: Record<ReadConfidence, number> = {
  CONFIRMED: 2,
  NEEDS_CONFIRMATION: 1,
  NONE: 0,
};

/**
 * Combine reads from several photos of the SAME physical item.
 *
 * One clear read wins. Two reads that disagree on the amount are never
 * averaged — they are downgraded to a confirmation, because the tag may have
 * been photographed at two different times or two different tags may be in
 * frame.
 */
export function combinePriceReads(reads: PriceRead[]): PriceRead {
  const usable = reads.filter((read) => read.sourceCostCents != null);
  if (usable.length === 0) {
    return reads[0] ?? {
      sourceCostCents: null,
      printedPriceCents: null,
      markdownPriceCents: null,
      stockRef: null,
      confidence: "NONE",
      prices: [],
      note: "No price could be read from these photos. Enter the source cost by hand.",
    };
  }

  const best = [...usable].sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
  )[0]!;
  const amounts = new Set(usable.map((read) => read.sourceCostCents));
  const agree = amounts.size === 1;

  const stockRef = usable.map((read) => read.stockRef).find(Boolean) ?? null;

  if (best.confidence === "CONFIRMED" && agree) {
    return { ...best, stockRef, prices: usable.flatMap((read) => read.prices) };
  }

  return {
    ...best,
    sourceCostCents: best.sourceCostCents,
    confidence: "NEEDS_CONFIRMATION",
    stockRef,
    prices: usable.flatMap((read) => read.prices),
    note: agree
      ? best.note
      : "The photos disagree about the price. Confirm or correct the source cost by hand.",
  };
}
