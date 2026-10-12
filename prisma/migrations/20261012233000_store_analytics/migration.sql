CREATE TABLE "AnalyticsEvent" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "kind" TEXT NOT NULL, "path" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'direct', "device" TEXT NOT NULL DEFAULT 'desktop', "orderId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AnalyticsEvent_createdAt_kind_idx" ON "AnalyticsEvent"("createdAt", "kind");
CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON "AnalyticsEvent"("sessionId", "createdAt");
