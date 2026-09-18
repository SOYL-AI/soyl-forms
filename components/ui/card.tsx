import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl2 border border-ink/10 bg-white p-6 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
