import Link from "next/link";
import { ArrowLeft, BarChart3, ExternalLink, PenLine, Webhook } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FormArea = "builder" | "responses" | "webhooks";

/** Header for form-scoped pages: back link, title, status, section tabs. */
export function FormSubnav({
  formId,
  title,
  status,
  slug,
  active,
  actions,
}: {
  formId: string;
  title: string;
  status: string;
  slug: string;
  active: FormArea;
  actions?: React.ReactNode;
}) {
  const tabs: Array<{ key: FormArea; href: string; label: string; icon: typeof PenLine }> = [
    { key: "builder", href: `/builder/${formId}`, label: "Build", icon: PenLine },
    { key: "responses", href: `/forms/${formId}/responses`, label: "Responses", icon: BarChart3 },
    { key: "webhooks", href: `/forms/${formId}/webhooks`, label: "Webhooks", icon: Webhook },
  ];
  return (
    <div className="border-b border-line pb-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All forms
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight">
            <span className="truncate">{title}</span>
            <StatusBadge status={status} />
          </h1>
          {status === "published" && (
            <a
              href={`/f/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-ink-faint hover:text-ink"
            >
              /f/{slug} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <nav aria-label="Form sections" className="mt-4 flex gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                on ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
