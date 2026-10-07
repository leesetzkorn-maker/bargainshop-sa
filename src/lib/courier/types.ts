/**
 * Courier / tracking provider contract.
 *
 * Same principle as payments: the admin UI and the storefront talk to this
 * interface, never to a courier SDK. Shipping of the parcel itself is handled
 * out of band; this module is only about booking a shipment and showing a
 * tracking reference to the customer.
 */

import type { ShippingMethod } from "@/lib/enums";

export interface BookShipmentInput {
  orderId: string;
  orderNumber: string;
  courier: string;
  serviceLevel: string;
  recipient: {
    fullName: string;
    phone: string;
    email: string;
    line1: string;
    line2?: string | null;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  parcel: {
    weightGrams: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
  items: Array<{ itemId: string; name: string; quantity: number }>;
  method: ShippingMethod;
}

export interface BookShipmentResult {
  ok: boolean;
  trackingNumber: string | null;
  trackingUrl: string | null;
  /** Populated when ok === false. */
  error?: string;
  raw?: unknown;
}

export interface TrackingEvent {
  description: string;
  location?: string;
  occurredAt: string;
}

export interface CourierProvider {
  readonly key: string;
  readonly label: string;
  readonly isConfigured: boolean;
  /** True when this module talks to a courier API. False = typed by hand. */
  readonly supportsApiBooking: boolean;

  bookShipment(input: BookShipmentInput): Promise<BookShipmentResult>;
  track(trackingNumber: string): Promise<{ ok: boolean; events: TrackingEvent[]; error?: string }>;
}
