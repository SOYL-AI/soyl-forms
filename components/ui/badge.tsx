import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "positive" | "warn" | "danger" | "accent" | "info" | "ink";

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5",
        tone === "neutral" && "bg-paper-deep text-ink-soft",
        tone === "positive" && "bg-positive-soft text-positive",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "accent" && "bg-accent-soft text-accent-ink dark:text-accent",
        tone === "info" && "bg-info-soft text-info",
        tone === "ink" && "bg-ink text-paper",
        className,
      )}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  published: { tone: "positive", label: "Live" },
  closed: { tone: "warn", label: "Closed" },
  archived: { tone: "neutral", label: "Archived" },
  active: { tone: "positive", label: "Active" },
  suspended: { tone: "danger", label: "Suspended" },
  deleted: { tone: "danger", label: "Deleted" },
  free: { tone: "neutral", label: "Free" },
  created: { tone: "neutral", label: "Created" },
  authenticated: { tone: "info", label: "Authenticated" },
  pending: { tone: "warn", label: "Pending" },
  halted: { tone: "danger", label: "Halted" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  expired: { tone: "neutral", label: "Expired" },
  completed: { tone: "positive", label: "Delivered" },
  failed: { tone: "danger", label: "Failed" },
  processing: { tone: "info", label: "Processing" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_TONE[status] ?? { tone: "neutral" as BadgeTone, label: status };
  return (
    <Badge tone={s.tone} dot={status === "published" || status === "active"}>
      {s.label}
    </Badge>
  );
}
