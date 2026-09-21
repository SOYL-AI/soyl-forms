import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Intentional empty state: says what's missing and how to fix it. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-paper-deep text-ink-soft">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
