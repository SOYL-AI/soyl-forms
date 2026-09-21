import Link from "next/link";
import type { ReactNode } from "react";
import { CreditCard, FileText, LayoutGrid, Palette, Shield, Sparkles } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PLANS } from "@/lib/plans";
import type { AppContext } from "@/lib/app-context";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";

export type AppArea = "forms" | "templates" | "brand" | "create" | "billing" | "account" | "none";

const NAV: Array<{ key: AppArea; href: string; label: string; icon: typeof FileText }> = [
  { key: "forms", href: "/dashboard", label: "Forms", icon: FileText },
  { key: "create", href: "/create", label: "Create with AI", icon: Sparkles },
  { key: "templates", href: "/templates", label: "Templates", icon: LayoutGrid },
  { key: "brand", href: "/brand", label: "Brand kit", icon: Palette },
  { key: "billing", href: "/billing", label: "Billing", icon: CreditCard },
];

/** Chrome for every signed-in page: top nav, plan pill, user menu, operator banner. */
export function AppShell({
  ctx,
  active,
  children,
  wide,
}: {
  ctx: AppContext;
  active: AppArea;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      {ctx.flags.maintenanceBanner ? (
        <p className="bg-warn-soft px-4 py-2 text-center text-xs font-medium text-ink">
          {ctx.flags.maintenanceBanner}
        </p>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-page items-center gap-2 px-4 sm:px-6">
          <BrandLockup compact />
          <nav aria-label="App" className="ml-4 hidden items-center gap-0.5 md:flex">
            {NAV.map((item) => {
              const Icon = item.icon;
              const on = active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    on ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className="flex-1" />
          <Link
            href="/billing"
            className={cn(
              "hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
              ctx.plan === "free" ? "bg-paper-deep text-ink-soft hover:text-ink" : "bg-accent-soft text-accent-ink dark:text-accent",
            )}
          >
            {PLANS[ctx.plan].name} plan
          </Link>
          {ctx.isAdmin ? (
            <Link
              href="/super-admin"
              aria-label="Operator console"
              title="Operator console"
              className="rounded-full p-2 text-ink-soft hover:bg-ink/5 hover:text-ink"
            >
              <Shield className="h-4 w-4" />
            </Link>
          ) : null}
          <ThemeToggle />
          <UserMenu email={ctx.email} name={ctx.displayName} workspaceName={ctx.workspaceName} />
        </div>
        <nav aria-label="App sections" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {NAV.map((item) => {
            const on = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                  on ? "bg-ink text-paper" : "bg-paper-deep text-ink-soft",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={cn("mx-auto w-full px-4 py-8 sm:px-6 sm:py-10", wide ? "max-w-[88rem]" : "max-w-page")}>
        {children}
      </main>
    </div>
  );
}
