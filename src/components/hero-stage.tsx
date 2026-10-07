"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Spotlight } from "@/lib/showcase";

const INTERVAL_MS = 4200;

/**
 * Rotating product spotlight. Only the active card is mounted on small
 * screens; desktop also mounts the previous and next cards. Motion is
 * transform/opacity only, and it pauses when the tab is hidden or the
 * visitor prefers reduced motion.
 *
 * The caller owns the list: it resolves real products first and falls back to
 * showcase artwork whose category slugs have already been checked against the
 * live catalogue. This component therefore renders nothing rather than falling
 * back to an unvalidated list that could link to a category that no longer
 * exists.
 */
export function HeroStage({ items }: { items: Spotlight[] }) {
  const spots = items;
  const count = spots.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [wide, setWide] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const wideQuery = window.matchMedia("(min-width: 1024px)");
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setWide(wideQuery.matches);
      setReduce(reduceQuery.matches);
    };
    sync();
    wideQuery.addEventListener("change", sync);
    reduceQuery.addEventListener("change", sync);
    return () => {
      wideQuery.removeEventListener("change", sync);
      reduceQuery.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (count === 0 || paused || reduce) return;
    let timer = 0;
    const start = () => {
      window.clearInterval(timer);
      if (document.hidden) return;
      timer = window.setInterval(() => {
        setActive((current) => (current + 1) % count);
      }, INTERVAL_MS);
    };
    const onVisibility = () => {
      window.clearInterval(timer);
      if (!document.hidden) start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paused, reduce, count]);

  const prev = (active - 1 + count) % count;
  const next = (active + 1) % count;
  const visible = new Set(wide ? [prev, active, next] : [active]);
  const current = spots[active];

  function roleFor(index: number): "active" | "prev" | "next" | "hidden" {
    if (index === active) return "active";
    if (!wide) return "hidden";
    if (index === prev) return "prev";
    if (index === next) return "next";
    return "hidden";
  }

  if (count === 0) return null;

  return (
    <div className="relative">
      <div
        className="relative mx-auto h-[22rem] w-full max-w-xl sm:h-[26rem]"
        aria-roledescription="carousel"
        aria-label="Featured second-hand bargains"
      >
        {spots.map((item, index) => {
          if (!visible.has(index)) return null;
          const role = roleFor(index);
          const position =
            role === "active"
              ? "left-1/2 top-2 z-20 w-[78%] -translate-x-1/2 lg:top-0 lg:w-[52%]"
              : role === "prev"
                ? "left-0 top-10 z-10 hidden w-[34%] opacity-80 lg:block"
                : role === "next"
                  ? "right-0 top-16 z-10 hidden w-[34%] opacity-80 lg:block"
                  : "hidden";

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-hidden={role !== "active"}
              tabIndex={role === "active" ? 0 : -1}
              onClick={(event) => {
                if (role !== "active") {
                  event.preventDefault();
                  setActive(index);
                }
              }}
              className={`absolute block transition-all duration-500 ease-out ${position}`}
            >
              <div className={role === "active" && !reduce ? "hero-float" : undefined}>
                <div className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_rgb(0_0_0/0.28)] ring-1 ring-white/40">
                  <div className="relative aspect-square bg-white">
                    <Image
                      src={item.image}
                      alt={role === "active" ? item.alt : ""}
                      fill
                      sizes="(max-width: 1024px) 70vw, 280px"
                      className={item.image.startsWith("/uploads/") ? "object-contain p-3" : "object-cover"}
                      preload={index === 0}
                    />
                    {role === "active" && (item.kicker || item.priceLabel) ? (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 via-ink-950/55 to-transparent px-3 pb-3 pt-10 text-left">
                        {item.kicker ? (
                          <p className="text-[11px] font-bold uppercase tracking-widest text-accent-400">{item.kicker}</p>
                        ) : null}
                        <p className="truncate text-sm font-bold text-white">{item.label}</p>
                        <p className="mt-0.5 flex items-center justify-between gap-2 text-sm">
                          <span className="font-bold text-white">{item.priceLabel ?? "Price to be confirmed"}</span>
                          <span className="rounded-full bg-accent-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-950">
                            Shop now
                          </span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-white" aria-live="off">
          {current?.label}
        </p>
        <div className="flex items-center gap-1.5">
          <StageButton label="Previous item" onClick={() => setActive(prev)}>
            <Chevron className="h-4 w-4 rotate-180" />
          </StageButton>
          <StageButton
            label={paused || reduce ? "Play slideshow" : "Pause slideshow"}
            pressed={paused || reduce}
            onClick={() => setPaused((value) => !value)}
          >
            {paused || reduce ? <PlayIcon className="h-3.5 w-3.5" /> : <PauseIcon className="h-3.5 w-3.5" />}
          </StageButton>
          <StageButton label="Next item" onClick={() => setActive(next)}>
            <Chevron className="h-4 w-4" />
          </StageButton>
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Featured items">
        {spots.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-label={item.label}
            onClick={() => setActive(index)}
            className={`h-1.5 rounded-full transition-all ${
              index === active ? "w-6 bg-accent-500" : "w-1.5 bg-white/35 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function StageButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
    >
      {children}
    </button>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <rect x="5" y="4" width="3.2" height="12" rx="1" />
      <rect x="11.8" y="4" width="3.2" height="12" rx="1" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 4.8a1 1 0 0 1 1.5-.86l8 4.7a1 1 0 0 1 0 1.72l-8 4.7A1 1 0 0 1 6.5 14.2V4.8Z" />
    </svg>
  );
}
