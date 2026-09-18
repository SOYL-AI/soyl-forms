import Link from "next/link";
import { BrandLockup } from "@/components/brand";
import { cn } from "@/lib/utils";

/** Slim account chrome for signed-in pages (dashboard, billing). */
export function AppHeader({ active }: { active: "forms" | "billing" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <BrandLockup compact />
        <nav aria-label="Account" className="flex items-center gap-1 text-sm font-semibold">
          <Link
            href="/dashboard"
            aria-current={active === "forms" ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 transition-colors",
              active === "forms"
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-ink/5 hover:text-ink",
            )}
          >
            Forms
          </Link>
          <Link
            href="/billing"
            aria-current={active === "billing" ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 transition-colors",
              active === "billing"
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-ink/5 hover:text-ink",
            )}
          >
            Billing
          </Link>
        </nav>
      </div>
    </header>
  );
}
