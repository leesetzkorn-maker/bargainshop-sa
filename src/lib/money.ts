/**
 * Money helpers.
 *
 * RULE: every monetary amount in this codebase is an integer number of cents.
 * Never introduce a float or a Prisma Decimal for money.
 */

/** Cents -> "R 1 499.00" (South African formatting). */
export function formatZAR(cents: number): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `R ${value.toFixed(2)}`;
  }
}

/**
 * Selling price for a customer, or null when no selling price has been set.
 * Zero is not a price. Callers must not render it as R0.
 */
export function formatCustomerPrice(cents: number): string | null {
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return formatZARCompact(cents);
}

/** Cents -> "R1 499" when the cents are zero, else the full amount. */
export function formatZARCompact(cents: number): string {
  return cents % 100 === 0 ? formatZAR(cents).replace(/\.00$/, "") : formatZAR(cents);
}

/** Cents -> "1499" for input[type=number] fields. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** "1499.00" | "1 499,00" | "R1,499.00" -> 149900. Returns null when unparseable. */
export function parseZARToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    const cents = Math.round(input * 100);
    return Number.isFinite(input) && input >= 0 && Number.isSafeInteger(cents) && cents <= 100_000_000 ? cents : null;
  }
  const raw = String(input).trim();
  if (!raw) return null;

  const text = raw.replace(/^(?:ZAR|R)\s*/i, "").replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(text)) return null;
  let whole = text;
  let fraction = "";
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalAt = Math.max(comma, dot);
    const grouping = comma < dot ? "," : ".";
    fraction = text.slice(decimalAt + 1);
    whole = text.slice(0, decimalAt);
    const grouped = new RegExp(`^[1-9]\\d{0,2}(?:\\${grouping}\\d{3})+$`);
    if (!/^\d{1,2}$/.test(fraction) || !grouped.test(whole)) return null;
    whole = whole.split(grouping).join("");
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const grouped = new RegExp(`^[1-9]\\d{0,2}(?:\\${separator}\\d{3})+$`);
    if (grouped.test(text)) whole = text.split(separator).join("");
    else {
      const match = text.match(new RegExp(`^(\\d+)\\${separator}(\\d{1,2})$`));
      if (!match) return null;
      whole = match[1]; fraction = match[2];
    }
  }
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000 ? cents : null;
}

export function gramsToKg(grams: number): string {
  const kg = grams / 1000;
  return `${kg.toFixed(kg < 1 ? 2 : 1).replace(/\.0+$/, "").replace(/0$/, "")} kg`;
}

export function formatWeight(grams: number): string {
  if (grams <= 0) return "—";
  if (grams < 1000) return `${grams} g`;
  return `${(grams / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`;
}

export function formatDimensions(l: number, w: number, h: number): string {
  return [l, w, h]
    .map((n) => Number(n).toFixed(0).replace(/\.0$/, ""))
    .join(" × ") + " cm";
}
