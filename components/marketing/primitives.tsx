import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  id,
  tone = "plain",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "plain" | "paper" | "ink";
}) {
  return (
    <section
      id={id}
      className={cn(
        tone === "paper" && "border-y border-line bg-paper",
        tone === "ink" && "bg-ink text-paper",
        className,
      )}
    >
      <div className="mx-auto max-w-page px-5 py-20 sm:px-6 sm:py-24">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  invert,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  invert?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? (
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", invert ? "text-paper/60" : "text-ink-faint")}>
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 font-display text-[2rem] leading-[1.08] tracking-tight sm:text-[2.6rem]">{title}</h2>
      {lede ? (
        <p className={cn("mt-4 text-lg leading-relaxed", invert ? "text-paper/70" : "text-ink-soft")}>{lede}</p>
      ) : null}
    </div>
  );
}

/**
 * Fine radiating lines, borrowed from the SOYL mark. Sits behind hero
 * artwork at low opacity; purely decorative.
 */
export function RadialLines({ className }: { className?: string }) {
  const lines = Array.from({ length: 36 }, (_, i) => (i * 360) / 36);
  return (
    <svg aria-hidden viewBox="0 0 800 800" className={cn("pointer-events-none absolute", className)} fill="none">
      <g stroke="currentColor" strokeWidth="1" strokeOpacity="0.9">
        {lines.map((deg) => (
          <line key={deg} x1="400" y1="400" x2={400 + 520 * Math.cos((deg * Math.PI) / 180)} y2={400 + 520 * Math.sin((deg * Math.PI) / 180)} />
        ))}
      </g>
    </svg>
  );
}
