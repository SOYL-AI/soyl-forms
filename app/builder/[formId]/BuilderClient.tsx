"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Monitor,
  Share2,
  Smartphone,
  X,
} from "lucide-react";
import type {
  Block,
  BlockType,
  FormSchemaV1,
  FormSettings,
  FormTheme,
  LogicRule,
} from "@/types/forms";
import { formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import { createBlock, duplicateBlock, moveBlock } from "@/lib/forms/builder";
import { resolveTheme } from "@/lib/forms/themes";
import { saveDraft } from "@/lib/forms/actions";
import type { BrandKitSummary } from "@/lib/brand/types";
import type { PlanCode } from "@/lib/plans";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { AddBlockButton, AddBlockPicker, Outline } from "@/components/builder/Outline";
import { DesignPanel } from "@/components/builder/DesignPanel";
import { BehaviorPanel } from "@/components/builder/BehaviorPanel";
import { PublishButton } from "@/components/builder/PublishButton";
import { SettingsPanel } from "@/components/builder/SettingsPanel";
import { ShareDialog } from "@/components/builder/ShareDialog";
import { BrandMark } from "@/components/brand";
import { Button, ButtonLink } from "@/components/ui/button";
import { Segmented } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "saving" | "error";
type MobileTab = "questions" | "preview" | "edit";
type RightTab = "question" | "design" | "settings";
type Device = "desktop" | "mobile";

export default function BuilderClient({
  formId,
  status: initialStatus,
  initialTitle,
  initialSchema,
  initialRevision,
  initialTheme,
  initialSettings,
  slug,
  brandKits,
  plan,
  publishedVersion,
}: {
  formId: string;
  status: string;
  initialTitle: string;
  initialSchema: FormSchemaV1;
  initialRevision: number;
  initialTheme: FormTheme;
  initialSettings: FormSettings;
  slug: string;
  brandKits: BrandKitSummary[];
  plan: PlanCode;
  publishedVersion: number | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<Block[]>(initialSchema.blocks);
  const [logic, setLogic] = useState<LogicRule[]>(initialSchema.logic);
  const [theme, setTheme] = useState<FormTheme>(initialTheme);
  const [settings, setSettings] = useState<FormSettings>(initialSettings);
  const [selectedId, setSelectedId] = useState<string | null>(initialSchema.blocks[0]?.id ?? null);
  const [revision, setRevision] = useState(initialRevision);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [justPublished, setJustPublished] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("questions");
  const [rightTab, setRightTab] = useState<RightTab>("question");
  const [device, setDevice] = useState<Device>("desktop");

  // Latest editable state for the debounced saver (avoids stale closures).
  const stateRef = useRef({ title, blocks, logic, theme, settings, revision });
  stateRef.current = { title, blocks, logic, theme, settings, revision };
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const firstRender = useRef(true);

  /** Persist a snapshot now. Returns true on success. Shared by autosave + publish flush. */
  const persist = useCallback(
    async (s: typeof stateRef.current): Promise<boolean> => {
      const candidate = { schemaVersion: 1 as const, title: s.title, blocks: s.blocks, logic: s.logic };
      const parsed = formSchemaV1.safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setSaveState("error");
        setSaveError(
          issue?.path?.[1] !== undefined
            ? `Question ${Number(issue.path[1]) + 1}: ${issue.message}`
            : "Some questions are incomplete — finish them to save.",
        );
        return false;
      }
      const graphErrors = validateLogicGraph(parsed.data);
      if (graphErrors.length > 0) {
        setSaveState("error");
        setSaveError(graphErrors[0] ?? "Invalid logic.");
        return false;
      }
      const res = await saveDraft({
        formId,
        title: s.title,
        schema: parsed.data,
        revision: s.revision,
        theme: s.theme,
        settings: s.settings,
      });
      if (res.ok) {
        setRevision(res.revision);
        stateRef.current.revision = res.revision;
        setSaveState("saved");
        setSaveError(null);
        return true;
      }
      setSaveState("error");
      setSaveError(res.error);
      return false;
    },
    [formId],
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    setSaveState("saving");
    return persist(stateRef.current);
  }, [persist]);

  // Debounced autosave (~800ms after edits), with a revision conflict guard.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const snapshot = stateRef.current;
    const t = setTimeout(() => {
      void persist(snapshot);
    }, 800);
    return () => clearTimeout(t);
  }, [title, blocks, logic, theme, settings, formId, persist]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStateRef.current === "saving") e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Shortcuts: "/" adds a block, Escape closes overlays.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (e.key === "Escape") {
        setPreviewOpen(false);
        return;
      }
      if (e.key === "/" && !typing && !previewOpen) {
        e.preventDefault();
        setPickerOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const selected = useMemo(() => blocks.find((b) => b.id === selectedId), [blocks, selectedId]);
  const logicSources = useMemo(() => new Set(logic.map((r) => r.when.questionId)), [logic]);
  const selectedRules = useMemo(
    () => (selected ? logic.filter((r) => r.when.questionId === selected.id) : []),
    [logic, selected],
  );
  const previewSchema: FormSchemaV1 = useMemo(
    () => ({ schemaVersion: 1, title, blocks, logic }),
    [title, blocks, logic],
  );
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  function addBlock(type: BlockType) {
    const block = createBlock(type);
    setBlocks((prev) => {
      const at = selectedId ? prev.findIndex((b) => b.id === selectedId) + 1 : prev.length;
      // Keep thank-you screens last.
      const lastIsThanks = prev[prev.length - 1]?.type === "thank_you";
      const insertAt = at < 0 ? prev.length : Math.min(at, lastIsThanks && type !== "thank_you" ? prev.length - 1 : prev.length);
      const next = [...prev];
      next.splice(insertAt, 0, block);
      return next;
    });
    setSelectedId(block.id);
    setRightTab("question");
    setMobileTab("edit");
  }

  function patchSelected(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setBlocks((prev) => prev.map((b) => (b.id === selectedId ? ({ ...b, ...patch } as Block) : b)));
  }

  function deleteSelected() {
    if (!selectedId) return;
    const id = selectedId;
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const next = prev.filter((b) => b.id !== id);
      setSelectedId(next[Math.min(idx, next.length - 1)]?.id ?? null);
      return next;
    });
    setLogic((prev) => prev.filter((r) => r.when.questionId !== id && r.then.blockId !== id));
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = duplicateBlock(selected);
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === selected.id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  }

  function setRulesFor(questionId: string, rules: LogicRule[]) {
    setLogic((prev) => [...prev.filter((r) => r.when.questionId !== questionId), ...rules]);
  }

  const saveBadge = (
    <span
      role="status"
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex",
        saveState === "saved" && "bg-positive-soft text-positive",
        saveState === "saving" && "bg-paper-deep text-ink-soft",
        saveState === "error" && "bg-danger-soft text-danger",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          saveState === "saved" && "bg-positive",
          saveState === "saving" && "animate-pulse bg-ink-faint",
          saveState === "error" && "bg-danger",
        )}
      />
      {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Save issue"}
    </span>
  );

  const rightPane = (
    <>
      <Segmented<RightTab>
        label="Editor sections"
        value={rightTab}
        onChange={setRightTab}
        className="mb-4 w-full [&>button]:flex-1"
        options={[
          { value: "question", label: "Question" },
          { value: "design", label: "Design" },
          { value: "settings", label: "Settings" },
        ]}
      />
      {rightTab === "question" && (
        <SettingsPanel
          block={selected}
          blocks={blocks}
          rules={selectedRules}
          formId={formId}
          onPatch={patchSelected}
          onRulesChange={(rules) => selected && setRulesFor(selected.id, rules)}
          onDuplicate={duplicateSelected}
          onDelete={deleteSelected}
        />
      )}
      {rightTab === "design" && (
        <DesignPanel
          theme={theme}
          onThemePatch={(p) => setTheme((t) => ({ ...t, ...p }))}
          onThemeReplace={(t) => setTheme(t)}
          brandKits={brandKits}
          plan={plan}
          formId={formId}
        />
      )}
      {rightTab === "settings" && (
        <BehaviorPanel settings={settings} onSettingsPatch={(p) => setSettings((s) => ({ ...s, ...p }))} plan={plan} />
      )}
    </>
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <BrandMark size={24} />
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Form name"
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 text-sm font-semibold focus:bg-paper-deep/60 focus:outline-none sm:max-w-xs"
          />
          {saveBadge}
          <span className="hidden items-center gap-1.5 sm:flex">
            <StatusBadge status={status} />
            {status === "published" && publishedVersion !== null && (
              <span className="text-[11px] text-ink-faint">v{justPublished ?? publishedVersion}</span>
            )}
          </span>
          <span className="flex-1" />
          <div className="hidden lg:block">
            <Segmented<Device>
              label="Preview device"
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: <Monitor className="h-3.5 w-3.5" aria-label="Desktop" /> },
                { value: "mobile", label: <Smartphone className="h-3.5 w-3.5" aria-label="Mobile" /> },
              ]}
            />
          </div>
          <ButtonLink href={`/forms/${formId}/responses`} variant="ghost" size="sm" className="hidden md:inline-flex">
            <BarChart3 className="h-3.5 w-3.5" /> Responses
          </ButtonLink>
          <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(true)} className="hidden sm:inline-flex">
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setJustPublished(null); setShareOpen(true); }}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <PublishButton
            formId={formId}
            published={status === "published"}
            onBeforePublish={flushSave}
            onPublished={(r) => {
              setStatus("published");
              setJustPublished(r.version);
              setShareOpen(true);
            }}
          />
        </div>
        {saveState === "error" && saveError && (
          <p role="alert" className="border-t border-danger/20 bg-danger-soft px-4 py-1.5 text-xs font-medium text-danger">
            {saveError}{" "}
            {/changed elsewhere/i.test(saveError) && (
              <button type="button" onClick={() => window.location.reload()} className="font-bold underline">
                Reload
              </button>
            )}
          </p>
        )}
        {/* Mobile tabs */}
        <nav aria-label="Builder sections" className="flex gap-1 border-t border-line px-3 py-1.5 lg:hidden">
          {(
            [
              ["questions", "Questions"],
              ["preview", "Preview"],
              ["edit", "Edit"],
            ] as Array<[MobileTab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setMobileTab(t)}
              aria-pressed={mobileTab === t}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold",
                mobileTab === t ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Three panes */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside
          className={cn(
            "min-h-0 overflow-y-auto border-r border-line bg-background p-3",
            mobileTab === "questions" ? "block" : "hidden",
            "lg:block",
          )}
          aria-label="Questions"
        >
          <Outline
            blocks={blocks}
            selectedId={selectedId}
            logicSources={logicSources}
            onSelect={(id) => {
              setSelectedId(id);
              setRightTab("question");
            }}
            onReorder={(a, o) => setBlocks((prev) => moveBlock(prev, a, o))}
          />
          <AddBlockButton onClick={() => setPickerOpen(true)} />
        </aside>

        <section
          className={cn(
            "min-h-0 overflow-y-auto bg-paper-deep/50 p-4 sm:p-8",
            mobileTab === "preview" ? "block" : "hidden",
            "lg:block",
          )}
          aria-label="Live preview"
        >
          <div
            className="mx-auto transition-[max-width] duration-300"
            style={{ maxWidth: device === "mobile" ? 400 : 760 }}
          >
            <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Live preview · follows the selected question
            </p>
            <div
              className="overflow-hidden rounded-[1.75rem] border border-line shadow-lift"
              style={{ background: resolvedTheme.background }}
            >
              <div className={cn("min-h-[540px]", device === "mobile" ? "px-6 py-10" : "px-8 py-12 sm:px-12")}>
                <FormRenderer
                  schema={previewSchema}
                  theme={theme}
                  settings={settings}
                  preview
                  focusBlockId={selectedId}
                />
              </div>
            </div>
          </div>
        </section>

        <aside
          className={cn(
            "min-h-0 overflow-y-auto border-l border-line bg-paper p-4",
            mobileTab === "edit" ? "block" : "hidden",
            "lg:block",
          )}
          aria-label="Editor"
        >
          {rightPane}
        </aside>
      </div>

      <AddBlockPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={addBlock} />
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        slug={slug}
        title={title}
        published={status === "published"}
        justPublishedVersion={justPublished ?? (status === "published" ? null : null)}
      />

      {/* Full-screen preview */}
      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen form preview"
          className="fixed inset-0 z-50 overflow-y-auto"
          style={{ background: resolvedTheme.background }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
            <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
              Preview · answers aren&apos;t saved
            </span>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <X className="h-3.5 w-3.5" /> Close (Esc)
            </button>
          </div>
          <div className="mx-auto max-w-2xl px-5 pb-16 pt-6">
            <FormRenderer key="fullscreen" schema={previewSchema} theme={theme} settings={settings} preview />
          </div>
        </div>
      )}
    </div>
  );
}
