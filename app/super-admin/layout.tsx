import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

const NAV = [
  ["Overview", "/super-admin"],
  ["Users", "/super-admin/users"],
  ["Workspaces", "/super-admin/workspaces"],
  ["Forms", "/super-admin/forms"],
  ["Billing", "/super-admin/billing"],
  ["Audit log", "/super-admin/audit"],
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
        <h1 className="font-display text-3xl tracking-tight">Not allowed here</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This console is for platform operators. Regular accounts get a 403 —
          by design, not by accident.
        </p>
        <p className="mt-4">
          <Link href="/" className="text-sm font-semibold underline underline-offset-2">
            Back to safety
          </Link>
        </p>
      </main>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-red-700">
        Operator console · {gate.role === "super_admin" ? "Super admin" : "Support admin"}
      </p>
      <nav aria-label="Super admin" className="mt-3 flex flex-wrap gap-1.5 border-b border-ink/10 pb-3">
        {NAV.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-ink/5"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}
