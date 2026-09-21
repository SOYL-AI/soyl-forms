"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Settings2,
  Shield,
  Users,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/super-admin/users", label: "Users", icon: Users },
  { href: "/super-admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/super-admin/forms", label: "Forms", icon: FileText },
  { href: "/super-admin/billing", label: "Billing", icon: CreditCard },
  { href: "/super-admin/usage", label: "Usage & cost", icon: Activity },
  { href: "/super-admin/settings", label: "Platform settings", icon: Settings2 },
  { href: "/super-admin/audit", label: "Audit log", icon: Shield },
];

export function AdminNav({ role, productName }: { role: string; productName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav aria-label="Operator console" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const Icon = item.icon;
        const on = item.href === "/super-admin" ? pathname === item.href : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              on ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-paper px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <BrandMark size={26} />
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">{productName}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-ink dark:text-accent">
              {role === "super_admin" ? "Super admin" : "Support admin"}
            </p>
          </div>
        </div>
        {links}
        <div className="mt-auto flex items-center justify-between border-t border-line px-2 pt-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to app
          </Link>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <BrandMark size={22} />
          <span className="text-sm font-semibold">Operator console</span>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Toggle navigation" className="rounded-full p-2">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-b border-line bg-paper px-3 py-3 lg:hidden">
          {links}
          <div className="mt-3 flex items-center justify-between border-t border-line px-2 pt-3">
            <Link href="/dashboard" className="text-xs font-semibold text-ink-soft">
              ← Back to app
            </Link>
            <ThemeToggle />
          </div>
        </div>
      )}
    </>
  );
}
