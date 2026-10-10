import { formatZAR } from "@/lib/money";
import { brand, contact, whatsappLink, copy } from "@/lib/brand";
import {
  PRODUCT_CONDITION_LABELS,
  SHIPPING_METHOD_LABELS,
  type ProductCondition,
  type ShippingMethod,
} from "@/lib/enums";
import type { OrderMailContext } from "./types";

/**
 * Order email templates.
 *
 * Two shapes for every message: an HTML body that survives Outlook and Gmail,
 * and a plain-text alternative for everything else. Both are built from the
 * same `OrderMailContext`, so a number can never disagree between the two.
 *
 * The HTML uses a 600px table layout with inline styles because that is still
 * the only thing every South African mailbox renders reliably. No CSS classes,
 * no web fonts, no external images.
 */

const SECOND_HAND_TERMS = "Second-hand goods, sold in the condition described in the product listing. Disclosed wear and defects form part of that description. Your statutory consumer rights, including applicable returns and refunds, remain unchanged.";

function receiptTerms(): string {
  return `<tr><td style="padding:0 32px 20px;">${muted(`${esc(SECOND_HAND_TERMS)} <a href="${esc(brand.url)}/terms">Terms</a> · <a href="${esc(brand.url)}/returns">Returns</a>.`)}</td></tr>`;
}

const INK = "#16181d";
const MUTED = "#5b6472";
const LINE = "#e3e6eb";
const BRAND = "#1a6b58";
const BRAND_DARK = "#0f4c3e";
const WASH = "#f5f7f8";
const WARN_BG = "#fff4e5";
const WARN_LINE = "#f0c07a";

function esc(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(cents: number, currency: string): string {
  return currency === "ZAR" ? formatZAR(cents) : `${currency} ${(cents / 100).toFixed(2)}`;
}

function conditionLabel(value: string): string {
  return PRODUCT_CONDITION_LABELS[value as ProductCondition] ?? value;
}

function methodLabel(value: string): string {
  return SHIPPING_METHOD_LABELS[value as ShippingMethod] ?? value;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function header(): string {
  return `
  <tr>
    <td style="padding:28px 32px 20px;border-bottom:1px solid ${LINE};">
      <p style="margin:0;font:700 20px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">
        ${esc(brand.name)}
      </p>
      <p style="margin:6px 0 0;font:400 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};">
        ${esc(brand.tagline)}
      </p>
    </td>
  </tr>`;
}

function footer(note?: string): string {
  const extra = note
    ? `<p style="margin:0 0 10px;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};">${esc(note)}</p>`
    : "";
  return `
  <tr>
    <td style="padding:22px 32px 30px;background:${WASH};border-top:1px solid ${LINE};">
      ${extra}
      <p style="margin:0 0 8px;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};">
        Questions? Reply to this email, email
        <a href="mailto:${esc(contact.email)}" style="color:${BRAND};">${esc(contact.email)}</a>
        or WhatsApp us on
        <a href="${esc(whatsappLink())}" style="color:${BRAND};">${esc(contact.phone)}</a>.
      </p>
      <p style="margin:0;font:400 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#8a929e;">
        ${esc(brand.name)} &middot; Second-hand goods sold online in South Africa.
        ${esc(contact.hours ? `Opening hours: ${contact.hours}` : "")}
      </p>
    </td>
  </tr>`;
}

function wrap(body: string): string {
  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(brand.name)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f3;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        ${header()}
        ${body}
        ${footer()}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 12px;font:700 22px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">${esc(text)}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 14px;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">${text}</p>`;
}

function muted(text: string): string {
  return `<p style="margin:0 0 14px;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};">${text}</p>`;
}

function callout(text: string, tone: "brand" | "warn" = "brand"): string {
  const bg = tone === "warn" ? WARN_BG : "#eef6f3";
  const border = tone === "warn" ? WARN_LINE : "#bcdcd0";
  const color = tone === "warn" ? "#7a4a12" : BRAND_DARK;
  return `
  <tr><td style="padding:0 32px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${border};border-radius:10px;">
      <tr><td style="padding:14px 16px;font:400 14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${color};">
        ${text}
      </td></tr>
    </table>
  </td></tr>`;
}

function button(href: string, label: string): string {
  return `
  <tr><td style="padding:4px 32px 26px;">
    <a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:14px 26px;border-radius:9px;">
      ${esc(label)}
    </a>
  </td></tr>`;
}

function sectionTitle(text: string): string {
  return `<p style="margin:0 0 10px;font:700 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;">${esc(text)}</p>`;
}

function keyValues(rows: Array<[string, string]>): string {
  const body = rows
    .filter(([, v]) => v.length > 0)
    .map(
      ([k, v]) => `<tr>
        <td style="padding:7px 0;font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};vertical-align:top;white-space:nowrap;padding-right:16px;">${esc(k)}</td>
        <td style="padding:7px 0;font:600 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};text-align:right;">${esc(v)}</td>
      </tr>`,
    )
    .join("");
  return `
  <tr><td style="padding:0 32px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
  </td></tr>`;
}

function itemRows(ctx: OrderMailContext, withMoney: boolean): string {
  return ctx.items
    .map(
      (item) => `<tr>
        <td style="padding:12px 0;border-top:1px solid ${LINE};vertical-align:top;">
          <p style="margin:0;font:600 14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">${esc(item.name)}</p>
          <p style="margin:3px 0 0;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};">
            Item ${esc(item.itemId)} &middot; ${esc(conditionLabel(item.condition))} condition${item.quantity > 1 ? ` &middot; Qty ${item.quantity}` : ""}
          </p>
        </td>
        ${
          withMoney
            ? `<td style="padding:12px 0;border-top:1px solid ${LINE};text-align:right;white-space:nowrap;font:600 14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};vertical-align:top;">${esc(money(item.lineTotalCents, ctx.currency))}</td>`
            : ""
        }
      </tr>`,
    )
    .join("");
}

function itemsTable(ctx: OrderMailContext, withMoney = true): string {
  return `
  <tr><td style="padding:0 32px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${itemRows(ctx, withMoney)}
    </table>
  </td></tr>`;
}

function totalsBlock(ctx: OrderMailContext): string {
  const row = (label: string, value: string, strong = false) => `<tr>
    <td style="padding:5px 0;font:${strong ? "700" : "400"} 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${strong ? INK : MUTED};">${esc(label)}</td>
    <td style="padding:5px 0;text-align:right;white-space:nowrap;font:${strong ? "700" : "600"} 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${strong ? INK : INK};">${esc(value)}</td>
  </tr>`;

  return `
  <tr><td style="padding:0 32px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid ${INK};">
      ${row("Items subtotal", money(ctx.subtotalCents, ctx.currency))}
      ${row(`Delivery (${methodLabel(ctx.delivery.method)})`, money(ctx.shippingCents, ctx.currency))}
      ${row("Total", money(ctx.totalCents, ctx.currency), true)}
    </table>
  </td></tr>`;
}

function addressBlock(ctx: OrderMailContext): string {
  const d = ctx.delivery;
  return `
  <tr><td style="padding:0 32px 24px;">
    ${sectionTitle("Delivery address")}
    <p style="margin:0;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
      <strong>${esc(d.fullName)}</strong><br>
      ${esc(d.line1)}${d.line2 ? `<br>${esc(d.line2)}` : ""}<br>
      ${esc(d.suburb)}, ${esc(d.city)}, ${esc(d.postalCode)}<br>
      ${esc(d.province)}, South Africa<br>
      ${esc(d.phone)}
    </p>
    ${d.notes ? muted(`<strong style="color:${INK};">Delivery instructions:</strong> ${esc(d.notes)}`) : ""}
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// 0. Fired the moment an order exists, before any money has moved.
//
// These two are deliberately distinct from the paid pair. An offline order can
// sit in PENDING_PAYMENT until the owner gets to it, and until these existed the
// store was completely silent in that window: the customer saw a confirmation
// screen they could lose, and the owner had no signal at all.
// ---------------------------------------------------------------------------

export function orderReceivedCustomerEmail(ctx: OrderMailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const first = ctx.customerName.split(" ")[0];
  const subject = `We have your order ${ctx.orderNumber}`;

  const body = `
  <tr><td style="padding:24px 32px 6px;">${h1(`Thank you, ${esc(first)}`)}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(
    `Your order is safely with us and the item${ctx.items.length === 1 ? " is" : "s are"} being held for you. This email is your receipt — you do not need to do anything right now.`,
  )}</td></tr>
  ${callout(`<strong>Next step.</strong> We confirm your order and arrange payment with you directly, then we check the item is still at the shop. ${esc(copy.whyItemsDisappear)}`)}
  ${itemsTable(ctx, true)}
  ${totalsBlock(ctx)}
  ${receiptTerms()}
  ${addressBlock(ctx)}
  ${keyValues([
    ["Order number", ctx.orderNumber],
    ["Placed", formatDate(ctx.createdAt)],
    ["Delivery method", methodLabel(ctx.delivery.method)],
    ["Payment", ctx.paymentMethodLabel],
  ])}
  ${button(ctx.orderUrl, "View your order")}
  <tr><td style="padding:0 32px 26px;">${muted(
    `Quote order number <strong>${esc(ctx.orderNumber)}</strong> in any message and we will find your order straight away.`,
  )}</td></tr>`;

  const text = [
    `We have your order ${ctx.orderNumber}`,
    "",
    `Thank you, ${first}. Your order is safely with us and the item is being held.`,
    `You do not need to do anything right now — we will confirm and arrange payment with you.`,
    "",
    SECOND_HAND_TERMS,
    `Terms: ${brand.url}/terms | Returns: ${brand.url}/returns`,
    "",
    "WHAT YOU ORDERED",
    ...ctx.items.map(
      (i) =>
        `  - ${i.name} (Item ${i.itemId}, ${conditionLabel(i.condition)}${i.quantity > 1 ? `, qty ${i.quantity}` : ""}) — ${money(i.lineTotalCents, ctx.currency)}`,
    ),
    "",
    `Items subtotal: ${money(ctx.subtotalCents, ctx.currency)}`,
    `Delivery:       ${money(ctx.shippingCents, ctx.currency)} (${methodLabel(ctx.delivery.method)})`,
    `TOTAL:          ${money(ctx.totalCents, ctx.currency)}`,
    `Payment:        ${ctx.paymentMethodLabel}`,
    "",
    "DELIVERING TO",
    `  ${ctx.delivery.fullName}`,
    `  ${ctx.delivery.line1}${ctx.delivery.line2 ? `, ${ctx.delivery.line2}` : ""}`,
    `  ${ctx.delivery.suburb}, ${ctx.delivery.city}, ${ctx.delivery.postalCode}, ${ctx.delivery.province}`,
    `  ${ctx.delivery.phone}`,
    ctx.delivery.notes ? `  Instructions: ${ctx.delivery.notes}` : "",
    "",
    `View your order: ${ctx.orderUrl}`,
    "",
    `Order number: ${ctx.orderNumber}`,
    "",
    `${brand.name} — ${brand.tagline}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html: wrap(body), text };
}

export function newOrderReceivedOwnerEmail(ctx: OrderMailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const itemCount = ctx.items.reduce((n, i) => n + i.quantity, 0);
  const subject = `New order ${ctx.orderNumber} — ${itemCount} item${itemCount === 1 ? "" : "s"}, ${money(ctx.totalCents, ctx.currency)} (awaiting payment)`;

  const body = `
  ${callout(
    `<strong>New order, money not in yet.</strong> Payment is <strong>${esc(ctx.paymentMethodLabel)}</strong>. Next step: contact the customer to settle it, then mark the order <strong>Paid</strong> and check the stock.`,
    "warn",
  )}
  <tr><td style="padding:22px 32px 6px;">${h1("New order awaiting payment")}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(
    `Order <strong>${esc(ctx.orderNumber)}</strong> was placed on ${esc(formatDate(ctx.createdAt))}. The item is reserved and cannot be sold to anyone else while this order is open.`,
  )}</td></tr>
  ${itemsTable(ctx, true)}
  ${totalsBlock(ctx)}
  ${keyValues([
    ["Order number", ctx.orderNumber],
    ["Placed", formatDate(ctx.createdAt)],
    ["Payment", ctx.paymentMethodLabel],
    ["Items subtotal", money(ctx.subtotalCents, ctx.currency)],
    ["Shipping", money(ctx.shippingCents, ctx.currency)],
    ["Amount due", money(ctx.totalCents, ctx.currency)],
    ["Delivery method", methodLabel(ctx.delivery.method)],
  ])}
  <tr><td style="padding:0 32px 22px;">
    ${sectionTitle("Customer")}
    <p style="margin:0;font:400 14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
      <strong>${esc(ctx.customerName)}</strong><br>
      <a href="mailto:${esc(ctx.customerEmail)}" style="color:${BRAND};">${esc(ctx.customerEmail)}</a><br>
      ${esc(ctx.customerPhone)}
    </p>
  </td></tr>
  ${addressBlock(ctx)}
  ${button(ctx.orderUrl, "Open this order")}
  <tr><td style="padding:0 32px 26px;">${muted(
    `The customer received an acknowledgement email. If you cannot secure an item, cancel from the admin panel and record the reason.`,
  )}</td></tr>`;

  const text = [
    `NEW ORDER AWAITING PAYMENT — ${ctx.orderNumber}`,
    "",
    `${itemCount} item(s) placed ${formatDate(ctx.createdAt)}. Payment: ${ctx.paymentMethodLabel}.`,
    `The stock is reserved while this order is open.`,
    "",
    "ITEMS",
    ...ctx.items.map(
      (i) =>
        `  - ${i.name} (Item ${i.itemId}, ${conditionLabel(i.condition)}${i.quantity > 1 ? `, qty ${i.quantity}` : ""}) — ${money(i.lineTotalCents, ctx.currency)}`,
    ),
    "",
    `Items subtotal: ${money(ctx.subtotalCents, ctx.currency)}`,
    `Shipping:      ${money(ctx.shippingCents, ctx.currency)}`,
    `AMOUNT DUE:    ${money(ctx.totalCents, ctx.currency)}`,
    "",
    "CUSTOMER",
    `  Name:  ${ctx.customerName}`,
    `  Email: ${ctx.customerEmail}`,
    `  Phone: ${ctx.customerPhone}`,
    "",
    "DELIVERY ADDRESS",
    `  ${ctx.delivery.fullName}`,
    `  ${ctx.delivery.line1}${ctx.delivery.line2 ? `, ${ctx.delivery.line2}` : ""}`,
    `  ${ctx.delivery.suburb}, ${ctx.delivery.city}, ${ctx.delivery.postalCode}`,
    `  ${ctx.delivery.province}, South Africa`,
    `  Method: ${methodLabel(ctx.delivery.method)}`,
    ctx.delivery.notes ? `  Instructions: ${ctx.delivery.notes}` : "",
    "",
    `Manage: ${ctx.orderUrl}`,
    "",
    `${brand.name} — ${brand.tagline}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html: wrap(body), text };
}

// ---------------------------------------------------------------------------
// 1. Owner: new paid order
// ---------------------------------------------------------------------------

export function newOrderOwnerEmail(ctx: OrderMailContext): { subject: string; html: string; text: string } {
  const itemCount = ctx.items.reduce((n, i) => n + i.quantity, 0);
  const subject = `Paid order ${ctx.orderNumber} — ${itemCount} item${itemCount === 1 ? "" : "s"}, ${money(ctx.totalCents, ctx.currency)}`;

  const body = `
  ${callout(
    `<strong>New paid order.</strong> The customer has already paid. Next step: check the item${itemCount === 1 ? " is" : "s are"} still at the shop, buy it, then mark the order <strong>Item secured</strong>.`,
  )}
  <tr><td style="padding:22px 32px 6px;">${h1("Someone just bought from you")}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(
    `Order <strong>${esc(ctx.orderNumber)}</strong> was placed on ${esc(formatDate(ctx.createdAt))} and payment has been recorded.`,
  )}</td></tr>
  ${itemsTable(ctx, true)}
  ${totalsBlock(ctx)}
  ${keyValues([
    ["Order number", ctx.orderNumber],
    ["Placed", formatDate(ctx.createdAt)],
    ["Payment", ctx.paymentMethodLabel],
    ["Items subtotal", money(ctx.subtotalCents, ctx.currency)],
    ["Shipping", money(ctx.shippingCents, ctx.currency)],
    ["Amount paid", money(ctx.totalCents, ctx.currency)],
    ["Delivery method", methodLabel(ctx.delivery.method)],
  ])}
  <tr><td style="padding:0 32px 22px;">
    ${sectionTitle("Customer")}
    <p style="margin:0;font:400 14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
      <strong>${esc(ctx.customerName)}</strong><br>
      <a href="mailto:${esc(ctx.customerEmail)}" style="color:${BRAND};">${esc(ctx.customerEmail)}</a><br>
      ${esc(ctx.customerPhone)}
    </p>
  </td></tr>
  ${addressBlock(ctx)}
  ${button(ctx.orderUrl, "Open this order")}
  <tr><td style="padding:0 32px 26px;">${muted(
    `If an item is no longer at the shop, cancel the order from the admin panel and record the reason — the customer is refunded automatically once you confirm the refund.`,
  )}</td></tr>`;

  const text = [
    `NEW PAID ORDER — ${ctx.orderNumber}`,
    "",
    `${itemCount} item(s) placed ${formatDate(ctx.createdAt)}. Payment is recorded, so please secure the stock next.`,
    "",
    "ITEMS",
    ...ctx.items.map(
      (i) =>
        `  - ${i.name} (Item ${i.itemId}, ${conditionLabel(i.condition)}${i.quantity > 1 ? `, qty ${i.quantity}` : ""}) — ${money(i.lineTotalCents, ctx.currency)}`,
    ),
    "",
    `Items subtotal: ${money(ctx.subtotalCents, ctx.currency)}`,
    `Shipping:      ${money(ctx.shippingCents, ctx.currency)}`,
    `AMOUNT PAID:   ${money(ctx.totalCents, ctx.currency)}`,
    "",
    "CUSTOMER",
    `  Name:  ${ctx.customerName}`,
    `  Email: ${ctx.customerEmail}`,
    `  Phone: ${ctx.customerPhone}`,
    "",
    "DELIVERY ADDRESS",
    `  ${ctx.delivery.fullName}`,
    `  ${ctx.delivery.line1}${ctx.delivery.line2 ? `, ${ctx.delivery.line2}` : ""}`,
    `  ${ctx.delivery.suburb}, ${ctx.delivery.city}, ${ctx.delivery.postalCode}`,
    `  ${ctx.delivery.province}, South Africa`,
    `  Method: ${methodLabel(ctx.delivery.method)}`,
    ctx.delivery.notes ? `  Instructions: ${ctx.delivery.notes}` : "",
    "",
    `Manage: ${ctx.orderUrl}`,
    "",
    `${brand.name} — ${brand.tagline}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html: wrap(body), text };
}

// ---------------------------------------------------------------------------
// 2. Customer: order confirmed
// ---------------------------------------------------------------------------

export function orderConfirmedEmail(ctx: OrderMailContext): { subject: string; html: string; text: string } {
  const subject = `Order ${ctx.orderNumber} confirmed — thank you, ${ctx.customerName.split(" ")[0]}`;

  const body = `
  <tr><td style="padding:24px 32px 6px;">${h1("Thank you, we have your order")}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(
    `Your order is confirmed and your payment of <strong>${esc(money(ctx.totalCents, ctx.currency))}</strong> has been recorded. We will keep you updated at every step.`,
  )}</td></tr>
  ${callout(`<strong>What happens next:</strong> we check the item is still available at the shop, then buy it for you, pack it and send it out. <a href="${esc(brand.url)}/how-it-works" style="color:${BRAND_DARK};">How buying works</a>.`)}
  ${itemsTable(ctx, true)}
  ${totalsBlock(ctx)}
  ${receiptTerms()}
  ${addressBlock(ctx)}
  ${keyValues([
    ["Order number", ctx.orderNumber],
    ["Placed", formatDate(ctx.createdAt)],
    ["Delivery method", methodLabel(ctx.delivery.method)],
  ])}
  <tr><td style="padding:0 32px 20px;">${sectionTitle("What happens next")}</td></tr>
  <tr><td style="padding:0 32px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${[
        ["1", "We check the item is still on the shelf at the shop."],
        ["2", "We buy the exact item for you and mark it secured."],
        ["3", "We pack it and hand it to the courier, then send you tracking."],
      ]
        .map(
          ([n, text]) => `<tr>
            <td width="26" style="padding:0 12px 10px 0;vertical-align:top;">
              <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:11px;background:${BRAND};color:#fff;font:700 12px/22px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${esc(n)}</span>
            </td>
            <td style="padding:2px 0 10px;font:400 14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">${esc(text)}</td>
          </tr>`,
        )
        .join("")}
    </table>
  </td></tr>
  ${callout(
    `<strong>One thing worth knowing.</strong> Our stock is second-hand and one-of-a-kind. If an item is no longer at the shop when we come to collect it, we cancel that item and <strong>refund you in full</strong> — you never lose money. ${esc(copy.whyItemsDisappear)}`,
    "warn",
  )}
  ${button(ctx.orderUrl, "View your order")}
  <tr><td style="padding:0 32px 26px;">${muted(
    `Keep your order number <strong>${esc(ctx.orderNumber)}</strong> handy — quote it in any message and we will find your order straight away.`,
  )}</td></tr>`;

  const text = [
    `Order ${ctx.orderNumber} confirmed — thank you, ${ctx.customerName.split(" ")[0]}`,
    "",
    `We have your order and your payment of ${money(ctx.totalCents, ctx.currency)} is recorded.`,
    "",
    SECOND_HAND_TERMS,
    `Terms: ${brand.url}/terms | Returns: ${brand.url}/returns`,
    "",
    "WHAT YOU ORDERED",
    ...ctx.items.map(
      (i) => `  - ${i.name} (Item ${i.itemId}, ${conditionLabel(i.condition)}${i.quantity > 1 ? `, qty ${i.quantity}` : ""}) — ${money(i.lineTotalCents, ctx.currency)}`,
    ),
    "",
    `Items subtotal: ${money(ctx.subtotalCents, ctx.currency)}`,
    `Delivery:       ${money(ctx.shippingCents, ctx.currency)} (${methodLabel(ctx.delivery.method)})`,
    `TOTAL:          ${money(ctx.totalCents, ctx.currency)}`,
    "",
    "DELIVERING TO",
    `  ${ctx.delivery.fullName}`,
    `  ${ctx.delivery.line1}${ctx.delivery.line2 ? `, ${ctx.delivery.line2}` : ""}`,
    `  ${ctx.delivery.suburb}, ${ctx.delivery.city}, ${ctx.delivery.postalCode}, ${ctx.delivery.province}`,
    `  ${ctx.delivery.phone}`,
    ctx.delivery.notes ? `  Instructions: ${ctx.delivery.notes}` : "",
    "",
    "WHAT HAPPENS NEXT",
    "  1. We check the item is still on the shelf at the shop.",
    "  2. We buy the exact item for you and mark it secured.",
    "  3. We pack it and hand it to the courier, then send you tracking.",
    "",
    `Our stock is second-hand and one-of-a-kind. If an item is no longer`,
    `available when we collect it, we cancel it and refund you in full.`,
    "",
    `View your order: ${ctx.orderUrl}`,
    "",
    `Order number: ${ctx.orderNumber}`,
    "",
    `${brand.name} — ${brand.tagline}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html: wrap(body), text };
}

// ---------------------------------------------------------------------------
// 3. Customer: shipped, with tracking
// ---------------------------------------------------------------------------

export function orderShippedEmail(ctx: OrderMailContext): { subject: string; html: string; text: string } {
  const tracking = ctx.tracking;
  const hasTracking = Boolean(tracking?.trackingNumber);

  const subject = `Order ${ctx.orderNumber} is on its way`;

  const body = `
  <tr><td style="padding:24px 32px 6px;">${h1("Your order is on its way")}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(
    `We have bought your item, packed it and handed it to the courier. It is now moving to you.`,
  )}</td></tr>
  ${
    hasTracking
      ? `<tr><td style="padding:0 32px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${WASH};border:1px solid ${LINE};border-radius:10px;">
            <tr><td style="padding:16px 18px;">
              ${sectionTitle("Tracking")}
              <p style="margin:0 0 4px;font:400 14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};">
                ${esc(tracking?.courierName ?? "Courier")}
              </p>
              <p style="margin:0 0 10px;font:700 18px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};letter-spacing:0.02em;">
                ${esc(tracking?.trackingNumber ?? "")}
              </p>
              ${
                tracking?.trackingUrl
                  ? `<a href="${esc(tracking.trackingUrl)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:12px 20px;border-radius:8px;">Track your parcel</a>`
                  : ""
              }
            </td></tr>
          </table>
        </td></tr>`
      : callout(
          "Your tracking number will be added to your order page as soon as the courier scans the parcel.",
        )
  }
  ${itemsTable(ctx, true)}
  ${addressBlock(ctx)}
  ${keyValues([
    ["Order number", ctx.orderNumber],
    ["Delivery method", methodLabel(ctx.delivery.method)],
    ["Amount", money(ctx.totalCents, ctx.currency)],
  ])}
  ${button(ctx.orderUrl, "View your order")}
  <tr><td style="padding:0 32px 26px;">${muted(
    `If the address above is wrong, contact us immediately on ${esc(contact.phone)} — parcels are much easier to redirect before they are delivered.`,
  )}</td></tr>`;

  const text = [
    `Order ${ctx.orderNumber} is on its way`,
    "",
    "We have bought your item, packed it and handed it to the courier.",
    "",
    hasTracking
      ? `TRACKING\n  ${tracking?.courierName ?? "Courier"}\n  ${tracking?.trackingNumber ?? ""}${tracking?.trackingUrl ? `\n  ${tracking.trackingUrl}` : ""}`
      : "Your tracking number will appear on your order page as soon as the courier scans the parcel.",
    "",
    "ITEMS",
    ...ctx.items.map((i) => `  - ${i.name} (Item ${i.itemId}) — ${money(i.lineTotalCents, ctx.currency)}`),
    "",
    `Amount: ${money(ctx.totalCents, ctx.currency)}`,
    "",
    "DELIVERING TO",
    `  ${ctx.delivery.fullName}, ${ctx.delivery.line1}, ${ctx.delivery.suburb}, ${ctx.delivery.city}, ${ctx.delivery.postalCode}`,
    "",
    `View your order: ${ctx.orderUrl}`,
    "",
    `${brand.name} — ${brand.tagline}`,
  ].join("\n");

  return { subject, html: wrap(body), text };
}

// ---------------------------------------------------------------------------
// 4. Customer: cancelled / refunded
// ---------------------------------------------------------------------------

export function orderRefundedEmail(
  ctx: OrderMailContext,
  kind: "cancelled" | "refunded",
): { subject: string; html: string; text: string } {
  const refunded = kind === "refunded";
  // Only talk about money if money was actually taken. An unpaid order that is
  // cancelled has nothing to refund, and telling the customer their "payment" is
  // on its way back is a promise that cannot be kept.
  const moneyWasTaken = refunded && ctx.wasPaid;

  const subject = refunded
    ? moneyWasTaken
      ? `Order ${ctx.orderNumber} cancelled and refunded`
      : `Order ${ctx.orderNumber} cancelled`
    : `Order ${ctx.orderNumber} has been cancelled`;

  const headline = refunded
    ? moneyWasTaken
      ? "We have refunded your order"
      : "Your order has been cancelled"
    : "Your order has been cancelled";

  const lead = refunded
    ? moneyWasTaken
      ? `We are sorry — the item for order <strong>${esc(ctx.orderNumber)}</strong> was no longer available and the order has been cancelled. <strong>Your payment of ${esc(money(ctx.totalCents, ctx.currency))} is being refunded in full.</strong>`
      : `Order <strong>${esc(ctx.orderNumber)}</strong> was no longer available and has been cancelled. You were not charged for it, so there is nothing to refund.`
    : `Order <strong>${esc(ctx.orderNumber)}</strong> has been cancelled. If you have already paid, you will be refunded in full.`;

  const body = `
  <tr><td style="padding:24px 32px 6px;">${h1(headline)}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(lead)}</td></tr>
  ${ctx.reason ? callout(`<strong>Reason:</strong> ${esc(ctx.reason)}`, "warn") : ""}
  ${itemsTable(ctx, true)}
  ${totalsBlock(ctx)}
  ${
    moneyWasTaken
      ? callout(
          `Refunds go back to the payment method you used and usually appear on your statement within <strong>3 to 5 working days</strong>, depending on your bank. Your order number <strong>${esc(ctx.orderNumber)}</strong> is your reference.`,
        )
      : ""
  }
  ${button(ctx.orderUrl, "View your order")}
  <tr><td style="padding:0 32px 26px;">${muted(
    `Nothing about this is your fault — second-hand stock simply moves fast. Have another look at what came in this week, there is new stock most days.`,
  )}</td></tr>`;

  const text = [
    moneyWasTaken
      ? `Order ${ctx.orderNumber} cancelled and refunded`
      : `Order ${ctx.orderNumber} has been cancelled`,
    "",
    refunded
      ? moneyWasTaken
        ? `The item was no longer available, so the order was cancelled. Your payment of ${money(ctx.totalCents, ctx.currency)} is being refunded in full.`
        : `The item was no longer available, so the order was cancelled. You were not charged.`
      : `This order has been cancelled. Any amount paid is being refunded.`,
    ctx.reason ? `\nREASON\n  ${ctx.reason}` : "",
    "",
    "ITEMS",
    ...ctx.items.map((i) => `  - ${i.name} (Item ${i.itemId}) — ${money(i.lineTotalCents, ctx.currency)}`),
    "",
    `Items subtotal: ${money(ctx.subtotalCents, ctx.currency)}`,
    `Delivery:       ${money(ctx.shippingCents, ctx.currency)}`,
    `Order total:    ${money(ctx.totalCents, ctx.currency)}`,
    "",
    moneyWasTaken ? "Refunds usually reach your account within 3 to 5 working days." : "",
    `View your order: ${ctx.orderUrl}`,
    "",
    `${brand.name} — ${brand.tagline}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html: wrap(body), text };
}

// ---------------------------------------------------------------------------
// 5. Owner: item secured confirmation (internal)
// ---------------------------------------------------------------------------

export function orderSecuredOwnerEmail(ctx: OrderMailContext): { subject: string; html: string; text: string } {
  const subject = `Item secured for order ${ctx.orderNumber} — ready to pack`;

  const body = `
  <tr><td style="padding:24px 32px 6px;">${h1("Stock secured")}</td></tr>
  <tr><td style="padding:0 32px 20px;">${p(
    `You marked the item for order <strong>${esc(ctx.orderNumber)}</strong> as secured. Pack it and move the order on to <strong>Preparing shipment</strong> when it is boxed and labelled.`,
  )}</td></tr>
  ${itemsTable(ctx, true)}
  ${addressBlock(ctx)}
  ${button(ctx.orderUrl, "Open this order")}`;

  const text = [
    `Item secured for order ${ctx.orderNumber}`,
    "",
    "Pack the item, then move the order to Preparing shipment once it is boxed and labelled.",
    "",
    "ITEMS",
    ...ctx.items.map((i) => `  - ${i.name} (Item ${i.itemId}) — ${money(i.lineTotalCents, ctx.currency)}`),
    "",
    "DELIVERING TO",
    `  ${ctx.delivery.fullName}, ${ctx.delivery.line1}, ${ctx.delivery.suburb}, ${ctx.delivery.city}, ${ctx.delivery.postalCode}`,
    "",
    `Manage: ${ctx.orderUrl}`,
  ].join("\n");

  return { subject, html: wrap(body), text };
}
