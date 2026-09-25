import { cn, formatCount, pct } from "@/lib/utils";

/**
 * Usage meter with the 80% / 95% warning bands the limit-reached flow
 * specifies. Text carries the numbers so color is never the only signal.
 */
export function Meter({
  label,
  used,
  limit,
  format = formatCount,
  className,
}: {
  label: string;
  used: number;
  limit: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const p = Math.min(100, pct(used, limit));
  const tone = p >= 95 ? "danger" : p >= 80 ? "warn" : "ok";
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-ink-soft">{label}</p>
        <p className="text-xs tabular-nums text-ink-faint">
          <span
            className={cn(
              "font-semibold",
              tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink",
            )}
          >
            {format(used)}
          </span>{" "}
          / {format(limit)}
        </p>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${p}% used`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-ink",
          )}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}
