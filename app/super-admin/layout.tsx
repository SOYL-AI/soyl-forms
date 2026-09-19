import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getProductName } from "@/lib/config";
import { Users, Building2, FileText, CreditCard, Shield, LayoutDashboard } from "lucide-react";

const NAV = [
  ["Overview", "/super-admin", LayoutDashboard],
  ["Users", "/super-admin/users", Users],
  ["Workspaces", "/super-admin/workspaces", Building2],
  ["Forms", "/super-admin/forms", FileText],
  ["Billing", "/super-admin/billing", CreditCard],
  ["Audit log", "/super-admin/audit", Shield],
] as const;

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await requireAdmin();
  if (!gate.ok && gate.reason === "signed-out") redirect("/login");
  if (!gate.ok) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="font-display text-3xl tracking-tight text-foreground">Not allowed here</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This console is for platform operators. Regular accounts get a 403 —
          by design, not by accident.
        </p>
        <p className="mt-4">
          <Link href="/" className="text-sm font-semibold underline underline-offset-2 text-foreground">
            Back to safety
          </Link>
        </p>
      </main>
    );
  }
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-ink/10 bg-paper-deep/50 px-4 py-6">
        <div className="mb-8 px-2">
          <Link href="/" className="font-display text-lg font-bold text-foreground">
            {getProductName()} <span className="text-brand-500">Admin</span>
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint mt-1">
            {gate.role === "super_admin" ? "Super Admin" : "Support Admin"}
          </p>
        </div>
        
        <nav aria-label="Super admin" className="flex-1 space-y-1">
          {NAV.map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex items-center justify-between border-t border-ink/10 pt-4 px-2">
          <p className="text-xs text-ink-faint">System Theme</p>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
