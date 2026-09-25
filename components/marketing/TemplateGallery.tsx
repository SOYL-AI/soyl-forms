import Link from "next/link";
import { Clock3 } from "lucide-react";
import { TEMPLATES, TEMPLATE_CATEGORIES, type FormTemplate, type TemplateCategory } from "@/lib/forms/templates";
import { resolveTheme } from "@/lib/forms/themes";
import { isAnswerable } from "@/lib/forms/logic";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UseTemplateButton } from "./UseTemplateButton";

export function TemplateCard({ template, signedIn }: { template: FormTemplate; signedIn: boolean }) {
  const t = resolveTheme(template.theme);
  const questions = template.schema.blocks.filter((b) => isAnswerable(b.type)).length;
  const hasLogic = template.schema.logic.length > 0;
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-line bg-paper transition-shadow hover:shadow-card">
      <Link href={`/templates/${template.id}`} className="block" aria-label={`Preview ${template.name}`}>
        <div className="px-6 pb-6 pt-7" style={{ background: t.background, color: t.text }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: t.accent }}>
            {template.category}
          </p>
          <p className="mt-2 text-xl leading-tight" style={{ fontFamily: t.heading.stack }}>
            {template.schema.blocks[0]?.title}
          </p>
          <span
            className="mt-4 inline-block px-4 py-1.5 text-xs font-semibold"
            style={{ background: t.accent, color: t.accentInk, borderRadius: t.buttonStyle === "pill" ? 999 : t.buttonStyle === "rounded" ? 10 : 4 }}
          >
            {template.schema.blocks[0]?.type === "welcome" ? (template.schema.blocks[0] as { buttonLabel?: string }).buttonLabel ?? "Start" : "Start"}
          </span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{template.name}</h3>
          {template.popular && <Badge tone="accent">Popular</Badge>}
        </div>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-soft">{template.description}</p>
        <p className="mt-3 flex items-center gap-3 text-xs text-ink-faint">
          <span>{questions} questions</span>
          {hasLogic && <span>· branching</span>}
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" /> ~{template.minutes} min
          </span>
        </p>
        <div className="mt-4 flex items-center gap-2">
          <UseTemplateButton templateId={template.id} signedIn={signedIn} />
          <Link href={`/templates/${template.id}`} className="text-sm font-semibold text-ink-soft hover:text-ink">
            Preview
          </Link>
        </div>
      </div>
    </article>
  );
}

export function TemplateGallery({
  category,
  signedIn,
  basePath = "/templates",
}: {
  category?: string;
  signedIn: boolean;
  basePath?: string;
}) {
  const active = TEMPLATE_CATEGORIES.includes(category as TemplateCategory) ? (category as TemplateCategory) : null;
  const list = active ? TEMPLATES.filter((t) => t.category === active) : TEMPLATES;
  return (
    <div>
      <nav aria-label="Template categories" className="flex flex-wrap gap-1.5">
        <Link
          href={basePath}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
            !active ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:border-ink/40",
          )}
        >
          All ({TEMPLATES.length})
        </Link>
        {TEMPLATE_CATEGORIES.map((c) => {
          const n = TEMPLATES.filter((t) => t.category === c).length;
          if (n === 0) return null;
          return (
            <Link
              key={c}
              href={`${basePath}?category=${encodeURIComponent(c)}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                active === c ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:border-ink/40",
              )}
            >
              {c} ({n})
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <TemplateCard key={t.id} template={t} signedIn={signedIn} />
        ))}
      </div>
    </div>
  );
}
