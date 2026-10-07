import "server-only";

import { geminiApiKey, geminiImageModel, geminiVisionModel } from "@/lib/env";
import { AiImageError, type ImageEditProvider, type ImagePayload, type Region, type StickerDetection } from "../types";

/**
 * Google Gemini image editing, over the public Gemini Developer API.
 *
 * Why this model and not a blur, a crop or a painted patch: these are
 * instruction-driven *generative* editors. They are given the photograph and a
 * description of the thing to take away, and they synthesise the surface that
 * was underneath it — matching the surrounding material, lighting and texture.
 * A blur or a rectangle destroys the pixels it covers; this reconstructs them.
 *
 * Two calls, one key:
 *   1. a vision call that returns the sticker's bounding box,
 *   2. an edit call that regenerates the pixels inside that box.
 *
 * The caller then composites the result back through the box, so the rest of
 * the photograph is bit-for-bit the original.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini will not wait forever, and neither should an admin staring at a button. */
const TIMEOUT_MS = 90_000;

/** Guard rails. A storefront photo is never going to be legitimately 40 MB. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/** Below this the model is guessing, and guessing wrong means erasing the product. */
const MIN_CONFIDENCE = 0.6;

/**
 * Ask for coordinates only.
 *
 * The instruction is deliberately narrow: "the pawn shop's own price sticker",
 * never "any label". Getting this wrong in the permissive direction deletes
 * the manufacturer's badge, model number or serial plate, which is both a lie
 * about the item and, for a serial number, a real-world problem.
 */
const DETECT_PROMPT = `You are inspecting a second-hand goods photograph for a resale store. The photo was taken in a pawn shop and may still carry that shop's own handwritten or printed price sticker, price tag or price label stuck onto the product.

Find ONLY that pawn shop price sticker.

Do NOT report, and do NOT treat as removable:
- manufacturer branding, logos, badges or brand names
- model numbers, part numbers or serial numbers
- specification plates, ratings labels, warning labels or certification marks
- barcodes, QR codes or retailer shelf talkers
- price tags that are genuinely part of the product's packaging

If the photograph contains no pawn shop price sticker at all, return an empty list. Do not invent one.

Return JSON only, with no prose and no code fence:
{"stickers":[{"box_2d":[ymin,xmin,ymax,xmax],"confidence":0.0,"description":"what this sticker is"}]}

Rules for the numbers:
- box_2d is [ymin, xmin, ymax, xmax].
- Every value is an integer normalised to 0-1000, measured from the TOP-LEFT corner.
- ymin and xmin are the top-left of the sticker; ymax and xmax are the bottom-right.
- The box must tightly enclose the whole sticker, including any curled corner or overhanging edge.
- confidence is your own certainty that this is the pawn shop's price sticker and not a product label. Be genuinely unsure rather than confident.
- Return at most 4 stickers.`;

/**
 * Ask for the removal.
 *
 * Note what is NOT in this prompt: no request to "make it look better". The
 * only sanctioned change is the removal itself, because every extra adjective
 * is an invitation to restyle a product photo that must stay a faithful record
 * of what the customer is buying.
 */
const REMOVE_PROMPT = (count: number) =>
  [
    "Edit this photograph.",
    "",
    `Remove the ${count === 1 ? "pawn shop price sticker" : `${count} pawn shop price stickers`} from the image, and reconstruct the surface that was underneath ${count === 1 ? "it" : "them"} so that it is continuous and natural.`,
    "",
    "Strict requirements:",
    "- Everything else must stay exactly as photographed. This is a catalogue photo of a specific physical item.",
    "- Do not alter the product: keep its shape, proportions, colour, texture, logos, printed model numbers, serial numbers, labels and every genuine marking exactly as they are.",
    "- Do not change the camera angle, the framing, the crop, the zoom or the size of the product.",
    "- Keep the background, the lighting, the shadows and the surface it sits on unchanged.",
    "- Do not add, move or remove anything else. Do not restyle, sharpen, relight or re-colour the photograph.",
    "- The result must look as though the sticker was never there.",
  ].join("\n");

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string };
}

async function callGemini(
  model: string,
  body: Record<string, unknown>,
  what: string,
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new AiImageError(
      "AI image editing is not set up. Add GEMINI_API_KEY to .env to switch it on.",
    );
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  // Honour whichever fires first: the admin navigating away, or our own ceiling.
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: abort,
      cache: "no-store",
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new AiImageError(
        `The image service did not answer within ${TIMEOUT_MS / 1000} seconds. Try again.`,
        true,
      );
    }
    // Deliberately not surfacing the raw cause: it can contain the API key.
    console.error("ai: gemini request failed", error);
    throw new AiImageError("The image service could not be reached. Try again in a moment.", true);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Log the real reason; show the admin something they can act on.
    console.error(`ai: gemini ${response.status} ${response.statusText}`, detail.slice(0, 800));

    if (response.status === 429) {
      throw new AiImageError(
        "The image service rate limit was reached. Wait a minute and try again.",
        true,
      );
    }
    if (response.status === 400 && /API key not valid|API_KEY_INVALID/i.test(detail)) {
      throw new AiImageError("GEMINI_API_KEY was rejected by Google. Check the key in .env.");
    }
    if (response.status === 404) {
      throw new AiImageError(
        `The model "${model}" is not available to this API key. Set GEMINI_IMAGE_MODEL in .env.`,
      );
    }
    throw new AiImageError("The image service could not process that photo. Try another one.");
  }

  const payload = (await response.json()) as GeminiResponse;
  if (payload.error) {
    console.error("ai: gemini returned an error", payload.error);
    throw new AiImageError("The image service rejected that request.");
  }
  if (payload.promptFeedback?.blockReason) {
    throw new AiImageError("The image service declined to process that photo.");
  }

  const candidate = payload.candidates?.[0];
  if (!candidate) {
    throw new AiImageError("The image service returned an empty response.", true);
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new AiImageError(
      `The image service stopped early (${candidate.finishReason}). Try again.`,
      true,
    );
  }

  void what;
  return payload;
}

function toBase64(bytes: Buffer): string {
  return bytes.toString("base64");
}

/**
 * Pull the first JSON object out of a model response.
 *
 * Gemini usually returns clean JSON when asked, but "usually" is not good
 * enough to crash an admin page over, so this strips code fences and leading
 * prose before parsing rather than assuming a perfect body.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AiImageError("The image service returned an unreadable detection result.", true);
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AiImageError("The image service returned an unreadable detection result.", true);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Parse a 0-1000 `box_2d` into normalised 0-1 space, dropping nonsense. */
function parseBox(raw: unknown): Region | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const values = raw.map((entry) => (typeof entry === "number" ? entry : Number(entry)));
  if (values.some((entry) => !Number.isFinite(entry))) return null;

  const [ymin, xmin, ymax, xmax] = values.map((entry) => clamp01(entry / 1000));
  if (ymax <= ymin || xmax <= xmin) return null;

  // A sticker covering ~90% of the frame is a mis-detection, not a sticker.
  if ((ymax - ymin) * (xmax - xmin) > 0.9) return null;

  return { y0: ymin, x1: xmax, y1: ymax, x0: xmin };
}

function decodePart(part: GeminiPart): ImagePayload | null {
  const inline = part.inlineData;
  if (!inline?.data || !inline.mimeType?.startsWith("image/")) return null;
  return { bytes: Buffer.from(inline.data, "base64"), contentType: inline.mimeType };
}

/** Cap the input so a 40 MB photo cannot blow the request budget. */
function assertUsable(image: ImagePayload): void {
  if (image.bytes.length === 0) {
    throw new AiImageError("That image file is empty.");
  }
  if (image.bytes.length > MAX_INPUT_BYTES) {
    throw new AiImageError("That photo is too large to edit. Use one under 12 MB.");
  }
  if (!image.contentType.startsWith("image/")) {
    throw new AiImageError("That file is not an image.");
  }
}

export const geminiImageProvider: ImageEditProvider = {
  key: "gemini",
  label: "Google Gemini (Nano Banana)",

  isConfigured(): boolean {
    return Boolean(geminiApiKey());
  },

  async findPriceSticker(image: ImagePayload, signal?: AbortSignal): Promise<StickerDetection[]> {
    assertUsable(image);

    const payload = await callGemini(
      geminiVisionModel(),
      {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: image.contentType,
                  data: toBase64(image.bytes),
                },
              },
              { text: DETECT_PROMPT },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT"] },
      },
      "detect",
      signal,
    );

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim();
    if (!text) return [];

    const parsed = extractJson(text) as { stickers?: unknown };
    const list = Array.isArray(parsed?.stickers) ? parsed.stickers : [];

    const detections: StickerDetection[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const region = parseBox(record.box_2d);
      if (!region) continue;

      const confidence =
        typeof record.confidence === "number" && Number.isFinite(record.confidence)
          ? clamp01(record.confidence)
          : 0;
      if (confidence < MIN_CONFIDENCE) continue;

      detections.push({
        region,
        confidence,
        description: typeof record.description === "string" ? record.description.slice(0, 120) : "",
      });
    }

    return detections;
  },

  async removeRegions(
    image: ImagePayload,
    regions: Region[],
    signal?: AbortSignal,
  ): Promise<ImagePayload> {
    assertUsable(image);
    if (regions.length === 0) {
      throw new AiImageError("Nothing was selected for removal.");
    }

    const payload = await callGemini(
      geminiImageModel(),
      {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: image.contentType,
                  data: toBase64(image.bytes),
                },
              },
              { text: REMOVE_PROMPT(regions.length) },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      },
      "edit",
      signal,
    );

    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const decoded = decodePart(part);
      if (decoded) return decoded;
    }

    // A text-only reply here almost always means the model refused or answered
    // in prose instead of editing. Surface its words so the admin knows why.
    const reply = parts.map((part) => part.text ?? "").join(" ").trim().slice(0, 200);
    throw new AiImageError(
      reply
        ? `The image service replied with text instead of an edited photo: ${reply}`
        : "The image service did not return an edited photo. Try again.",
      true,
    );
  },
};