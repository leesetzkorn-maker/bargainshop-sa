import "server-only";

import { geminiApiKey } from "@/lib/env";
import { geminiImageProvider } from "./providers/gemini-image";
import type { ImageEditProvider } from "./types";

/**
 * AI image module registry.
 *
 * Same shape as the mail and payments registries: adding a second backend is a
 * new file in `providers/` plus one entry here. The admin UI and the composite
 * step never learn which model produced the pixels.
 */
const providers: Record<string, ImageEditProvider> = {
  gemini: geminiImageProvider,
};

export function getImageEditProvider(): ImageEditProvider {
  return providers.gemini;
}

/**
 * True when the AI tools should be offered at all.
 *
 * The admin hides the whole feature when this is false, so a store with no API
 * key sees an unchanged admin panel rather than a button that fails.
 */
export function isImageEditingConfigured(): boolean {
  return Boolean(geminiApiKey()) && getImageEditProvider().isConfigured();
}