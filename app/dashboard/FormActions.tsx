"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  PenLine,
  Pencil,
  Plus,
} from "lucide-react";
import { createForm, duplicateForm, renameForm, setFormArchived } from "@/lib/forms/actions";
import { useQrScanner, QrScanResult } from "@/components/QrScanner";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { FormSummary } from "./page";

export function ScanQrButton() {
  const { scanning, result, error, startScan, clearResult } = useQrScanner();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only show on native platform (Capacitor Android)
    import("@capacitor/core")
      .then(({ Capacitor }) => setReady(Capacitor.isNativePlatform()))
      .catch(() => setReady(false));
  }, []);

  if (!ready) return null;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={startScan} disabled={scanning} aria-label="Scan QR code">
        {scanning ? "Scanning…" : "Scan QR"}
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {result && result.type === "display" && <QrScanResult value={result.value} onClose={clearResult} />}
    </>
  );
}

export function NewFormButton({ variant = "accent", label = "New form" }: { variant?: ButtonVariant; label?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Name your form" description="You can change it any time." size="sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await createForm({ title: name });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push(`/builder/${res.id}`);
            });
          }}
        >
          <Field label="Form name" htmlFor="new-form-name" error={error}>
            <Input id="new-form-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Event signup" maxLength={200} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create & open builder"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/f/${slug}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* selectable link is shown anyway */
        }
      }}
      className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2.5 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:text-ink"
      aria-label="Copy public link"
    >
      {copied ? <Check className="h-3 w-3 text-positive" /> : <Link2 className="h-3 w-3" />}
      /f/{slug}
    </button>
  );
}

export function FormCard({
  form,
  total,
  thisMonth,
  archived,
}: {
  form: FormSummary;
  total: number;
  thisMonth: number;
  archived?: boolean;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(form.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setMenu(false);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return (
    <li className="relative flex flex-col rounded-2xl border border-line bg-paper p-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={archived ? `/forms/${form.id}/responses` : `/builder/${form.id}`} className="block truncate text-base font-semibold hover:underline">
            {form.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <StatusBadge status={form.status} />
            <span>Updated {timeAgo(form.updated_at)}</span>
          </p>
        </div>
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Form actions"
            className="rounded-full p-1.5 text-ink-soft hover:bg-ink/5 hover:text-ink"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded-2xl border border-line bg-paper p-1.5 shadow-pop">
              {!archived && (
                <>
                  <Link role="menuitem" href={`/builder/${form.id}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ink/5">
                    <PenLine className="h-4 w-4" /> Open builder
                  </Link>
                  <Link role="menuitem" href={`/forms/${form.id}/responses`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ink/5">
                    <BarChart3 className="h-4 w-4" /> Responses
                  </Link>
                  {form.status === "published" && (
                    <a role="menuitem" href={`/f/${form.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ink/5">
                      <ExternalLink className="h-4 w-4" /> Open live form
                    </a>
                  )}
                  <button role="menuitem" type="button" onClick={() => { setMenu(false); setRenaming(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink/5">
                    <Pencil className="h-4 w-4" /> Rename
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const res = await duplicateForm({ formId: form.id });
                        if (res.ok) router.push(`/builder/${res.id}`);
                        return res;
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink/5"
                  >
                    <Copy className="h-4 w-4" /> Duplicate
                  </button>
                </>
              )}
              <button
                role="menuitem"
                type="button"
                disabled={pending}
                onClick={() => {
                  if (archived || window.confirm(`Archive “${form.title}”? Its public link stops working. You can restore it later.`)) {
                    run(() => setFormArchived({ formId: form.id, archived: !archived }));
                  } else {
                    setMenu(false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink/5"
              >
                {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {archived ? "Restore" : "Archive"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <Link href={`/forms/${form.id}/responses`} className="group">
          <p className="font-display text-2xl leading-none tracking-tight">
            {total.toLocaleString("en-IN")}
            <span className="ml-1.5 align-middle font-sans text-xs font-normal text-ink-faint">responses</span>
          </p>
          <p className="mt-1 text-xs text-ink-faint group-hover:text-ink">{thisMonth.toLocaleString("en-IN")} this month · view →</p>
        </Link>
        {form.status === "published" && !archived ? <CopyLinkButton slug={form.slug} /> : null}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename form" size="sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameForm({ formId: form.id, title: name }));
            setRenaming(false);
          }}
        >
          <Field label="Form name" htmlFor={`rename-${form.id}`}>
            <Input id={`rename-${form.id}`} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setRenaming(false); setName(form.title); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </li>
  );
}
