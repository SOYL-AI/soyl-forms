"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Sixteen-ray spark. Decorative; pair with `.ai-spark` to make it turn and breathe. */
export function AiSpark({ className }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 16;
    const length = i % 2 === 0 ? 11 : 7.5;
    return { x: 12 + Math.cos(angle) * length, y: 12 + Math.sin(angle) * length, key: i };
  });
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      {rays.map((r) => (
        <line key={r.key} x1="12" y1="12" x2={r.x} y2={r.y} />
      ))}
    </svg>
  );
}

/**
 * Claude-style working indicator: a turning spark, status messages that move
 * forward every few seconds (holding on the last one), and elapsed seconds.
 */
export function AiThinking({
  messages,
  interval = 2600,
  className,
}: {
  messages: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const step = setInterval(() => setIndex((i) => Math.min(i + 1, messages.length - 1)), interval);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(step);
      clearInterval(tick);
    };
  }, [messages.length, interval]);

  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-3", className)}>
      <AiSpark className="ai-spark h-6 w-6 shrink-0 text-accent" />
      <span key={index} className="ai-status-in min-w-0">
        <span className="ai-shimmer text-sm font-medium">{messages[index]}</span>
      </span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-faint" aria-hidden>
        {seconds}s
      </span>
    </div>
  );
}

/** A form outline that assembles itself line by line while a draft is written. */
export function AiFormSkeleton({ className }: { className?: string }) {
  const bars: Array<{ w: string; h: string; mt: string }> = [
    { w: "w-2/3", h: "h-7", mt: "mt-0" },
    { w: "w-5/6", h: "h-3.5", mt: "mt-4" },
    { w: "w-1/2", h: "h-3.5", mt: "mt-2" },
    { w: "w-full", h: "h-12", mt: "mt-8" },
    { w: "w-full", h: "h-12", mt: "mt-2.5" },
    { w: "w-full", h: "h-12", mt: "mt-2.5" },
    { w: "w-28", h: "h-11", mt: "mt-8" },
  ];
  return (
    <div className={className} aria-hidden>
      {bars.map((b, i) => (
        <div
          key={i}
          className={cn("ai-skeleton rounded-xl", b.w, b.h, b.mt, i === bars.length - 1 && "rounded-full")}
          style={{ animationDelay: `${i * 420}ms, 0ms` }}
        />
      ))}
    </div>
  );
}
