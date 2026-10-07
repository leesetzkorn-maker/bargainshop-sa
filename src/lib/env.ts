import "server-only";

/**
 * Server-only configuration + secret access.
 *
 * Nothing in this module may be imported by a client component. Values are
 * validated lazily (not at module load) so that `next build` can still
 * prerender pages on a machine that does not have the production secrets.
 */

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your deployment environment.`,
    );
  }
  return devFallback;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Signs the admin session cookie. Rotating this logs every admin out. */
export function authSecret(): string {
  return required("AUTH_SECRET", "dev-only-insecure-auth-secret-do-not-use-in-production");
}

/** Signs the customer cart cookie. */
export function cartSecret(): string {
  return required("CART_SECRET", "dev-only-insecure-cart-secret-do-not-use-in-production");
}

/**
 * Which payment module to use. See src/lib/payments.
 * "offline" = no gateway configured yet: orders are created and payment is
 * confirmed manually in the admin. "none" = checkout closed.
 */
export function paymentProviderKey(): string {
  return (optional("PAYMENT_PROVIDER") || "offline").toLowerCase();
}

/** Which courier/tracking module to use. See src/lib/courier. */
export function courierProviderKey(): string {
  return (optional("COURIER_PROVIDER") || "manual").toLowerCase();
}

/**
 * Which email module to use. See src/lib/mail.
 * "log"     = no provider configured. Every message is rendered to the server
 *             log and recorded as NOT SENT, so nothing is ever silently faked.
 * "resend"  = real delivery over the Resend HTTP API.
 * "disabled"= no email at all, not even a log line.
 */
export function mailProviderKey(): string {
  return (optional("MAIL_PROVIDER") || "log").toLowerCase();
}

export function resendApiKey(): string | undefined {
  return optional("RESEND_API_KEY");
}

/**
 * Formats an RFC 5322 address. The display name is only quoted when it contains
 * a special character, so the common "2DE BARGAINS <orders@x.co.za>" form stays
 * readable instead of turning into "2DE BARGAINS" <orders@x.co.za>".
 */
function formatAddress(name: string | undefined, address: string): string {
  const label = name?.trim();
  if (!label) return address;
  if (/[()<>[\]:;@\\,."]/.test(label)) {
    return `"${label.replace(/[\\"]/g, "\\$&")}" <${address}>`;
  }
  return `${label} <${address}>`;
}

/**
 * The "From" identity for transactional mail.
 *
 * `.env.example` documents MAIL_FROM_NAME + MAIL_FROM_ADDRESS, so that is what
 * is read here. A single pre-composed MAIL_FROM still wins when it is set
 * explicitly, because some gateways want the exact header string.
 *
 * Falling back to the Resend onboarding address in production would silently
 * send real customer mail from an unverified sender, so production requires a
 * real address instead.
 */
export function mailFrom(): string {
  const explicit = optional("MAIL_FROM");
  if (explicit) return explicit;

  const address = optional("MAIL_FROM_ADDRESS");
  if (!address) {
    if (isProduction()) {
      throw new Error(
        "Missing required environment variable MAIL_FROM_ADDRESS. Real customer mail must not be sent from the provider's onboarding address.",
      );
    }
    return "2DE BARGAINS <onboarding@resend.dev>";
  }

  return formatAddress(optional("MAIL_FROM_NAME") || "2DE BARGAINS", address);
}

/** Where new-order alerts go. Defaults to the public contact address. */
export function ownerNotificationEmail(): string | undefined {
  return optional("OWNER_NOTIFICATION_EMAIL") || optional("NEXT_PUBLIC_CONTACT_EMAIL");
}

// ---------------------------------------------------------------------------
// AI IMAGE EDITING  (removing pawn-shop price stickers from product photos)
// ---------------------------------------------------------------------------
// Deliberately NOT "required". Until a key is present the admin simply hides
// the "Remove price tag with AI" button, so an unconfigured store behaves
// exactly as it did before this feature existed — no broken button, no fake
// result, no failed save.
//
// The key comes from Google AI Studio (aistudio.google.com/apikey). See
// .env.example for the full explanation of why this model and not a blur.

/** Google AI Studio key. Undefined = the AI image tools stay hidden. */
export function geminiApiKey(): string | undefined {
  return optional("GEMINI_API_KEY");
}

/**
 * The image model that does the sticker removal. Defaults to Nano Banana 2,
 * which is the current sweet spot for instruction-driven photo editing: it
 * reconstructs the surface behind a removed object instead of smearing over
 * it, and costs a fraction of a cent per image.
 */
export function geminiImageModel(): string {
  return optional("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image";
}

/**
 * The model used to LOCATE the sticker. Vision quality matters more here than
 * generation quality, so this can point at a text/vision model; when unset it
 * reuses the image model, which is perfectly capable of returning coordinates.
 */
export function geminiVisionModel(): string {
  return optional("GEMINI_VISION_MODEL") || geminiImageModel();
}

export function storageDriver(): "local" | "s3" {
  const value = (optional("STORAGE_DRIVER") || "local").toLowerCase();
  return value === "s3" ? "s3" : "local";
}

export function maxUploadBytes(): number {
  const mb = Number.parseInt(optional("MAX_UPLOAD_MB") || "8", 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 8) * 1024 * 1024;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Reads a credential for a payment module. Deliberately untyped: adding a real
 * gateway means adding its keys here, and nothing else in the codebase should
 * reference gateway-specific env var names.
 */
export function gatewayCredential(name: string): string | undefined {
  return optional(name);
}
