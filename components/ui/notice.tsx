import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warn" | "danger" | "positive";

export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status" | "note";
}) {
  const Icon =
    tone === "warn"
      ? AlertTriangle
      : tone === "danger"
        ? XCircle
        : tone === "positive"
          ? CheckCircle2
          : Info;
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "info" && "border-info/20 bg-info-soft",
        tone === "warn" && "border-warn/25 bg-warn-soft",
        tone === "danger" && "border-danger/25 bg-danger-soft",
        tone === "positive" && "border-positive/25 bg-positive-soft",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "info" && "text-info",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
          tone === "positive" && "text-positive",
        )}
      />
      <div className="min-w-0 text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5" : undefined, "text-ink-soft")}>{children}</div> : null}
      </div>
    </div>
  );
}
