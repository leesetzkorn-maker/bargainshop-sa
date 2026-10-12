import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { currentAdmin } from "@/lib/dal/admin";
import { ANALYTICS_COOKIE } from "@/lib/analytics";
import { safeAnalyticsPath, analyticsSource, analyticsDevice } from "@/lib/analytics-shared";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new NextResponse(null, { status: 413 });
  const ua = request.headers.get("user-agent") ?? "";
  if (/bot|crawler|spider|headless/i.test(ua) || request.headers.get("dnt") === "1") return new NextResponse(null, { status: 204 });
  try {
    if (await currentAdmin()) return new NextResponse(null, { status: 204 });
    const raw = await request.text();
    if (raw.length > 2048) return new NextResponse(null, { status: 413 });
    const body = JSON.parse(raw);
    const path = safeAnalyticsPath(body.path);
    if (!path) return new NextResponse(null, { status: 400 });
    const existing = request.cookies.get(ANALYTICS_COOKIE)?.value;
    const sessionId = existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : randomUUID();
    const since = new Date(Date.now() - 86400000);
    if (await prisma.analyticsEvent.count({ where: { sessionId, createdAt: { gte: since } } }) >= 200) return new NextResponse(null, { status: 204 });
    const previous = await prisma.analyticsEvent.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" }, select: { path: true, kind: true, source: true, device: true, createdAt: true } });
    if (!(previous?.kind === "page_view" && previous.path === path && Date.now() - previous.createdAt.getTime() < 2000)) {
      await prisma.analyticsEvent.create({ data: { sessionId, kind: "page_view", path, source: previous?.source ?? analyticsSource(body.referrer, origin), device: previous?.device ?? analyticsDevice(ua) } });
    }
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(ANALYTICS_COOKIE, sessionId, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 1800 });
    return response;
  } catch { return new NextResponse(null, { status: 204 }); }
}
