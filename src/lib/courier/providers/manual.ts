import type { BookShipmentInput, BookShipmentResult, CourierProvider, TrackingEvent } from "../types";

/**
 * Manual tracking module.
 *
 * No courier has been chosen yet, so nothing is booked automatically. An admin
 * types the tracking number into the order screen and it appears immediately on
 * the customer's order page. Swapping in a real courier later is a matter of
 * implementing this interface.
 */
export const manualCourierProvider: CourierProvider = {
  key: "manual",
  label: "Manual tracking (courier not yet integrated)",
  isConfigured: true,
  supportsApiBooking: false,

  async bookShipment(input: BookShipmentInput): Promise<BookShipmentResult> {
    return {
      ok: false,
      trackingNumber: null,
      trackingUrl: null,
      error:
        "No courier API is connected. Add the tracking number manually on the order screen.",
      raw: {
        module: "manual",
        orderNumber: input.orderNumber,
        courier: input.courier,
        note: "No external courier API was called.",
      },
    };
  },

  async track(): Promise<{ ok: boolean; events: TrackingEvent[]; error?: string }> {
    return {
      ok: false,
      events: [],
      error: "Live tracking is not available until a courier is integrated.",
    };
  },
};
