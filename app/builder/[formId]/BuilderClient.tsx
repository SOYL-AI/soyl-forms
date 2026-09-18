"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Block, BlockType, FormSchemaV1, FormSettings, FormTheme, LogicRule } from "@/types/forms";
import { formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import {
  createBlock,
  duplicateBlock,
  moveBlock,
  newBlockId,
} from "@/lib/forms/builder";
import { saveDraft } from "@/lib/forms/actions";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { AddBlockPalette, Outline } from "@/components/builder/Outline";
import { DesignPanel } from "@/components/builder/DesignPanel";
import { PublishButton } from "@/components/builder/PublishButton";
import { SettingsPanel } from "@/components/builder/SettingsPanel";
import { ShareDialog } from "@/components/builder/ShareDialog";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "saving" | "error";
type Tab = "questions" | "preview" | "settings";

export default function BuilderClient({
  formId,
  status,
  initialTitle,
  initialSchema,
  initialRevision,
  initialTheme,
  initialSettings,
  slug,
}: {
  formId: string;
  status: string;
  initialTitle: string;
  initialSchema: FormSchemaV1;
  initialRevision: number;
  initialTheme: FormTheme;
  initialSettings: FormSettings;
  slug: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<Block[]>(initialSchema.blocks);
  const [logic, setLogic] = useState<LogicRule[]>(initialSchema.logic);
  const [theme, setTheme] = useState<FormTheme>(initialTheme);
  const [settings, setSettings] = useState<FormSettings>(initialSettings);
  const [rightTab, setRightTab] = useState<"block" | "design">("block");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSchema.blocks[0]?.id ?? null,
  );
  const [revision, setRevision] = useState(initialRevision);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("questions");

  // Latest editable state for the debounced saver (avoids stale closures).
  const stateRef = useRef({ title, blocks, logic, theme, settings, revision });
  stateRef.current = { title, blocks, logic, theme, settings, revision };
  const firstRender = useRef(true);

  /** Persist a snapshot now. Returns true on success. Shared by autosave + publish flush. */
  const persist = useCallback(
    async (s: typeof stateRef.current): Promise<boolean> => {
      const candidate = {
        schemaVersion: 1 as const,
        title: s.title,
        blocks: s.blocks,
        logic: s.logic,
      };
      const parsed = formSchemaV1.safeParse(candidate);
      if (!parsed.success) {
        setSaveState("error");
        setSaveError("Some questions are incomplete — finish them to save.");
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

  /** Flush pending edits before publishing so theme/settings can't go stale. */
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

  // Don't let unsaved work vanish silently on navigation.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (stateRef.current && saveStateRef.current === "saving") {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  // Preview modal: Escape closes.
  useEffect(() => {
    if (!previewOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedId),
    [blocks, selectedId],
  );

  // With nothing selected, the right pane is always the Design tab.
  const effectiveRightTab = selected ? rightTab : "design";

  const previewSchema: FormSchemaV1 = useMemo(
    () => ({ schemaVersion: 1, title, blocks, logic }),
    [title, blocks, logic],
  );

  function addBlock(type: BlockType) {
    const block = createBlock(type);
    setBlocks((prev) => {
      const at = selectedId
        ? prev.findIndex((b) => b.id === selectedId) + 1
        : prev.length;
      const next = [...prev];
      next.splice(at < 0 ? prev.length : at, 0, block);
      return next;
    });
    setSelectedId(block.id);
  }

  function patchSelected(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setBlocks((prev) =>
      prev.map((b) => (b.id === selectedId ? ({ ...b, ...patch } as Block) : b)),
    );
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
    // Drop logic rules that pointed at (or from) the deleted block.
    setLogic((prev) =>
      prev.filter((r) => r.when.questionId !== id && r.then.blockId !== id),
    );
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

  function jumpTargetFor(questionId: string): string | null {
    return (
      logic.find((r) => r.when.questionId === questionId)?.then.blockId ?? null
    );
  }

  function setJump(questionId: string, target: string | null) {
    setLogic((prev) => {
      const rest = prev.filter((r) => r.when.questionId !== questionId);
      if (!target) return rest;
      return [
        ...rest,
        {
          id: newBlockId("r"),
          when: { questionId, operator: "answered" as const },
          then: { action: "goto" as const, blockId: target },
        },
      ];
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-2.5">
          <Link
            href="/dashboard"
            aria-label="SOYL Forms — back to dashboard"
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-ink/5"
          >
            <BrandMark size={26} />
            <span aria-hidden className="text-sm font-semibold text-ink-soft">←</span>
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Form name"
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-base font-bold focus:bg-paper-deep/60 focus:outline-none sm:max-w-xs"
          />
          <span
            role="status"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              saveState === "saved" && "bg-brand-50 text-brand-700",
              saveState === "saving" && "bg-amber-50 text-amber-800",
              saveState === "error" && "bg-red-50 text-red-700",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                saveState === "saved" && "bg-brand-600",
                saveState === "saving" && "animate-pulse bg-amber-500",
                saveState === "error" && "bg-red-600",
              )}
            />
            {saveState === "saved" && "Saved"}
            {saveState === "saving" && "Saving…"}
            {saveState === "error" && "Save issue"}
          </span>
          <span className="hidden rounded-full bg-paper-deep px-3 py-1 text-xs font-semibold capitalize text-ink-soft sm:inline">
            {status}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold transition-colors hover:border-ink/30"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold transition-colors hover:border-ink/30"
          >
            Share
          </button>
          <PublishButton formId={formId} onBeforePublish={flushSave} />
          {shareOpen && (
            <ShareDialog slug={slug} title={title} onClose={() => setShareOpen(false)} />
          )}
        </div>
        {saveState === "error" && saveError && (
          <p role="alert" className="mx-auto max-w-[1400px] px-4 pb-2 text-xs font-medium text-red-700">
            {saveError}{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-bold underline"
            >
              Reload
            </button>
          </p>
        )}
      </header>

      {/* Mobile tabs */}
      <nav aria-label="Builder sections" className="flex gap-1 border-b border-ink/10 bg-white px-4 py-2 lg:hidden">
        {(["questions", "preview", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-xs font-semibold capitalize",
              tab === t ? "bg-ink text-white" : "text-ink-soft hover:bg-ink/5",
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Three panes */}
      <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className={cn("flex-col gap-4", tab === "questions" ? "flex" : "hidden", "lg:flex")} aria-label="Questions">
          <Outline
            blocks={blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={(a, o) => setBlocks((prev) => moveBlock(prev, a, o))}
          />
          <AddBlockPalette onAdd={addBlock} />
        </aside>

        <section
          className={cn("min-h-[50vh] rounded-2xl border border-ink/10 p-5 sm:p-8", tab === "preview" ? "block" : "hidden", "lg:block")}
          style={{ backgroundColor: theme.background ?? "#fff" }}
          aria-label="Live preview"
        >
          <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Live preview — exactly what respondents see
          </p>
          <div className="mx-auto max-w-xl">
            <FormRenderer schema={previewSchema} theme={theme} />
          </div>
        </section>

        <aside className={cn("rounded-2xl border border-ink/10 bg-white p-4", tab === "settings" ? "block" : "hidden", "lg:block")} aria-label="Settings">
          <div className="mb-4 flex gap-1 rounded-full bg-paper-deep/60 p-1" role="tablist" aria-label="Settings sections">
            {(["block", "design"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={effectiveRightTab === t}
                onClick={() => setRightTab(t)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold capitalize",
                  effectiveRightTab === t ? "bg-white shadow-sm" : "text-ink-soft",
                )}
              >
                {t === "block" ? "Question" : "Design"}
              </button>
            ))}
          </div>
          {effectiveRightTab === "block" ? (
            <SettingsPanel
              block={selected}
              blocks={blocks}
              jumpTarget={selected ? jumpTargetFor(selected.id) : null}
              onPatch={patchSelected}
              onJumpChange={(t) => selected && setJump(selected.id, t)}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
            />
          ) : (
            <DesignPanel
              theme={theme}
              settings={settings}
              onThemePatch={(p) => setTheme((t) => ({ ...t, ...p }))}
              onSettingsPatch={(p) => setSettings((s) => ({ ...s, ...p }))}
            />
          )}
        </aside>
      </div>

      {/* Full-screen preview */}
      {previewOpen && (
        <div role="dialog" aria-modal="true" aria-label="Full-screen form preview" className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <div className="mx-auto max-w-2xl px-5 pb-16 pt-6">
            <div className="mb-8 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
                Full-screen preview
              </p>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30"
              >
                ✕ Close (Esc)
              </button>
            </div>
            <FormRenderer schema={previewSchema} />
          </div>
        </div>
      )}
    </div>
  );
}
