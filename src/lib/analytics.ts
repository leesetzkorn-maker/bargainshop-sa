import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { currentAdmin } from "@/lib/dal/admin";

export const ANALYTICS_COOKIE = "2de_visit";
export async function recordStoreEvent(kind: string, path: string, orderId?: string) {
  // Analytics must never interrupt a purchase, including during deployment.
  try {
    const requestHeaders = await headers();
    if (requestHeaders.get("dnt") === "1" || /bot|crawler|spider|headless/i.test(requestHeaders.get("user-agent") ?? "")) return;
    if (await currentAdmin()) return;
    const sessionId = (await cookies()).get(ANALYTICS_COOKIE)?.value;
    if (!sessionId || !/^[a-f0-9-]{36}$/.test(sessionId)) return;
    const first = await prisma.analyticsEvent.findFirst({ where: { sessionId }, select: { source: true, device: true } });
    await prisma.analyticsEvent.create({ data: { sessionId, kind, path, orderId, source: first?.source ?? "direct", device: first?.device ?? "desktop" } });
  } catch { console.warn("Store analytics event could not be recorded."); }
}
