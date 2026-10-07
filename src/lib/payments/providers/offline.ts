import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentSessionStatus,
} from "../types";

/**
 * The only payment module shipped with this repository.
 *
 * There is deliberately NO gateway integration here. The business account and
 * gateway have not been chosen yet, and inventing credentials would be worse
 * than shipping nothing. This provider lets the entire order flow be built,
 * tested and run end-to-end while payment is settled manually.
 *
 * The order is created and the stock is reserved exactly as it would be with a
 * real gateway; an admin then marks the payment as paid from the dashboard.
 * When a real gateway is added, the behaviour of every other module is
 * unchanged — only `PAYMENT_PROVIDER` moves.
 */
export const offlineProvider: PaymentProvider = {
  key: "offline",
  label: "Manual payment",
  isConfigured: true,
  get canAcceptLivePayments() { return Boolean(process.env.OFFLINE_PAYMENT_INSTRUCTIONS?.trim()); },
  get customerInstructions() { return process.env.OFFLINE_PAYMENT_INSTRUCTIONS?.trim() ? [process.env.OFFLINE_PAYMENT_INSTRUCTIONS.trim(), "Use your order number as the payment reference. Your item is reserved pending payment confirmation."] : [
    "No online payment gateway is connected to the store yet.",
    "Your order has been placed and the item is reserved for you.",
    "We will contact you on the number you provided to arrange payment.",
    "Quote your order number in any message about this order.",
  ]; },

  async createPaymentSession(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      redirectUrl: null,
      providerRef: `MANUAL-${input.orderNumber}`,
      instructions: [
        "No online payment gateway has been connected to the store yet.",
        "Your order has been placed and the item is reserved for you.",
        "We will contact you on the number provided to arrange payment and delivery.",
        `Quote your order number ${input.orderNumber} in any correspondence.`,
      ],
      raw: {
        module: "offline",
        note: "Created by the offline payment module. No gateway was contacted.",
        amountCents: input.amountCents,
        currency: input.currency,
      },
    };
  },

  async getPaymentStatus(): Promise<PaymentSessionStatus> {
    // Nothing to poll: an admin confirms payment from the dashboard, which
    // writes a settledBy of "admin:<userId>" onto the Payment row.
    return { status: "PENDING", providerRef: null };
  },
};
