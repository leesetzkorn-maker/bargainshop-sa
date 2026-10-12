"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function StoreAnalytics() {
  const path = usePathname();
  useEffect(() => {
    if (navigator.doNotTrack === "1") return;
    const timer = setTimeout(() => {
      void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, referrer: document.referrer }), keepalive: true }).catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, [path]);
  return null;
}
