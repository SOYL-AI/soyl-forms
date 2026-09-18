import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all active:scale-[0.99]",
        size === "md" ? "px-5 py-2.5 text-sm" : "px-7 py-3.5 text-base",
        variant === "primary" &&
          "bg-ink text-white shadow-lift hover:bg-black",
        variant === "secondary" &&
          "border border-ink/15 bg-white text-ink hover:border-ink/30",
        variant === "ghost" && "text-ink hover:bg-ink/5",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
