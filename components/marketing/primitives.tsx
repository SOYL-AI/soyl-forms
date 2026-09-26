import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
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
        tone === "ink" && "bg-inverse text-inverse-ink",
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
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", invert ? "text-inverse-ink/60" : "text-ink-faint")}>
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 font-display text-[2rem] leading-[1.08] tracking-tight sm:text-[2.6rem]">{title}</h2>
      {lede ? (
        <p className={cn("mt-4 text-lg leading-relaxed", invert ? "text-inverse-ink/70" : "text-ink-soft")}>{lede}</p>
      ) : null}
    </div>
  );
}

/** Closing call to action on a dark band (dark in both site themes). */
export function CtaBand({ title = "Your next form takes five minutes." }: { title?: ReactNode }) {
  return (
    <section className="px-5 pb-20 sm:px-6 sm:pb-24">
      <div className="relative mx-auto max-w-page overflow-hidden rounded-[2rem] bg-inverse px-6 py-16 text-center text-inverse-ink ring-1 ring-inverse-line sm:py-24">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] text-inverse-ink/[0.07]">
          <RadialLines className="inset-0 h-full w-full" />
        </div>
        <h2 className="relative mx-auto max-w-2xl font-display text-[2.25rem] leading-[1.05] tracking-tight sm:text-[3.2rem]">{title}</h2>
        <div className="relative mt-9 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/signup" variant="accent" size="lg">
            Start free <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href="/templates" variant="ghost" size="lg" className="text-inverse-ink/80 hover:bg-inverse-ink/10 hover:text-inverse-ink">
            Browse templates
          </ButtonLink>
        </div>
      </div>
    </section>
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
