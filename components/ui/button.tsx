import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/** Shared classes so <button> and <a> render identically. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,border-color,color,transform,opacity,filter] duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3.5 text-xs",
    size === "md" && "h-10 px-5 text-sm",
    size === "lg" && "h-12 px-7 text-base",
    variant === "primary" && "bg-ink text-paper hover:bg-ink/90",
    variant === "accent" && "bg-accent text-accent-ink hover:brightness-105",
    variant === "secondary" &&
      "border border-line-strong bg-paper text-ink hover:border-ink/40 hover:bg-paper-deep/60",
    variant === "ghost" && "text-ink-soft hover:bg-ink/5 hover:text-ink",
    variant === "danger" && "bg-danger-soft text-danger hover:bg-danger hover:text-white",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <button className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  href: string;
}) {
  const cls = buttonClasses({ variant, size, className });
  if (href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}
