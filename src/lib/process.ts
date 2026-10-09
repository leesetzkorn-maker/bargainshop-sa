/** Customer-facing process copy, shared by the homepage and the how-it-works page. */

export const BUYING_STEPS = [
  {
    title: "You find a bargain",
    body: "Browse the latest second-hand products online. Every listing shows the price, a condition grade, and a note about that specific item.",
  },
  {
    title: "You pay online",
    body: "You place your order on this website. The item price and the delivery cost are both shown before you confirm. You complete your payment securely on Yoco's payment page. Your order is confirmed once the payment succeeds.",
  },
  {
    title: "We check and secure it",
    body: "The item is sourced from our physical second-hand supplier after your order. Placing the order takes the listing off this website. It does not lock the item at the supplier, who can still sell a one-off before we collect it.",
  },
  {
    title: "We test it",
    body: "Every item is checked and confirmed working before it is prepared for shipping. That check is not a professional refurbishment, and it is not a claim that the item is new.",
  },
  {
    title: "We ship it",
    body: "Orders are processed within 2 business days. Once your order has been dispatched, you'll receive your shipping information so you can track your delivery. Available delivery methods and the full delivery price are shown at checkout. Choose your collection locker when using locker delivery.",
  },
  {
    title: "Enjoy your bargain",
    body: "You receive your second-hand bargain. Normal cosmetic wear described on the listing is part of the item, not a surprise.",
  },
] as const;

export const TEST_CHECKS = [
  { item: "Drills", check: "Power and basic function checked" },
  { item: "Grinders", check: "Power and basic function checked" },
  { item: "Electronics", check: "Power, display and basic function checked" },
  { item: "Phones", check: "Power and basic functionality checked" },
  { item: "Laptops", check: "Boot and basic functionality checked" },
  { item: "Consoles", check: "Power and basic functionality checked" },
  { item: "Appliances", check: "Basic operation checked" },
] as const;

export const DISPATCH_PROMISE = {
  title: "Fast dispatch. Tested before shipping.",
  lead: "We know you don't want to wait around for your bargain.",
  processing: "Orders are processed within 2 business days.",
  testing: "Every item is checked and confirmed working before it is prepared for shipping.",
  tracking: "Once your order has been dispatched, you'll receive your shipping information so you can track your delivery.",
  stock: "Because our products are genuine second-hand bargains and stock is limited, popular items can sell quickly.",
} as const;

export const TRUST_POINTS = [
  { title: "Fast dispatch", body: "Processed within 2 business days." },
  { title: "Tested before shipping", body: "Confirmed working before it is packed." },
  { title: "Real second-hand bargains", body: "One-off stock, priced to move." },
  { title: "Checkout on this website", body: "You order here, with delivery shown first." },
  { title: "Courier delivery", body: "Locker or courier, across South Africa." },
  { title: "Refund if we cannot secure it", body: "Cancelled and refunded under our policy." },
] as const;
