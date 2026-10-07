type ClassValue = string | number | false | null | undefined;

/** Minimal class-name joiner. Falsy values are dropped. */
export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

/** URL-safe slug. Falls back to a short random suffix for non-latin input. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    // strip accents: é -> e
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `item-${Math.random().toString(36).slice(2, 8)}`;
}

/** Trims a string and collapses runs of whitespace. */
export function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** First N characters, cut on a word boundary, with an ellipsis. */
export function excerpt(text: string, max = 160): string {
  const clean = tidy(text);
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Renders a value for an <input type="number"> from a Prisma number field. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function bool(value: boolean | null | undefined): string {
  return value ? "true" : "";
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Strips formatting from a South African mobile number, keeping + and digits. */
export function normalisePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}
