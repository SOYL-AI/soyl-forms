"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Search, Zap } from "lucide-react";
import type { Block, BlockType } from "@/types/forms";
import {
  BLOCK_GROUP_LABELS,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_META,
  type BlockGroup,
} from "@/lib/forms/builder";
import { BLOCK_ICONS } from "@/lib/forms/blockIcons";
import { isAnswerable } from "@/lib/forms/logic";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function SortableRow({
  block,
  index,
  selected,
  hasLogic,
  onSelect,
}: {
  block: Block;
  index: number | null;
  selected: boolean;
  hasLogic: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const Icon = BLOCK_ICONS[block.type];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 text-left transition-colors",
        selected ? "border-ink bg-paper shadow-card" : "border-transparent hover:bg-paper",
        isDragging && "z-10 shadow-lift",
      )}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${block.title}`}
        className="cursor-grab touch-none rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
            selected ? "bg-ink text-paper" : "bg-paper-deep text-ink-soft",
          )}
          aria-hidden
        >
          {index !== null ? index : <Icon className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {block.title || <span className="text-ink-faint">Untitled</span>}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            {BLOCK_TYPE_LABELS[block.type]}
            {isAnswerable(block.type) && block.required ? <span title="Required">·&nbsp;required</span> : null}
            {hasLogic ? <Zap className="h-3 w-3" aria-label="Has logic" /> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export function Outline({
  blocks,
  selectedId,
  logicSources,
  onSelect,
  onReorder,
}: {
  blocks: Block[];
  selectedId: string | null;
  /** Block ids that have at least one logic rule. */
  logicSources: Set<string>;
  onSelect: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) {
      onReorder(String(e.active.id), String(e.over.id));
    }
  }

  let n = 0;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-0.5" aria-label="Form questions">
          {blocks.map((b) => {
            const idx = isAnswerable(b.type) ? ++n : null;
            return (
              <SortableRow
                key={b.id}
                block={b}
                index={idx}
                selected={b.id === selectedId}
                hasLogic={logicSources.has(b.id)}
                onSelect={() => onSelect(b.id)}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

const GROUP_ORDER: BlockGroup[] = ["text", "choice", "scale", "input", "screens"];
const ALL_TYPES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[];

/** Searchable, grouped block picker. Opens with the "/" shortcut in the builder. */
export function AddBlockPicker({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (type: BlockType) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ALL_TYPES.filter(
      (t) =>
        !needle ||
        BLOCK_TYPE_LABELS[t].toLowerCase().includes(needle) ||
        BLOCK_TYPE_META[t].hint.toLowerCase().includes(needle) ||
        t.includes(needle.replace(/\s+/g, "_")),
    );
  }, [q]);

  return (
    <Dialog open={open} onClose={onClose} title="Add a question" size="lg">
      <label className="flex items-center gap-2 rounded-xl border border-line-strong bg-paper px-3 py-2">
        <Search className="h-4 w-4 text-ink-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search question types…"
          aria-label="Search question types"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              onAdd(results[0]);
              onClose();
            }
          }}
        />
      </label>
      <div className="mt-4 max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        {GROUP_ORDER.map((group) => {
          const types = results.filter((t) => BLOCK_TYPE_META[t].group === group);
          if (types.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {BLOCK_GROUP_LABELS[group]}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {types.map((t) => {
                  const Icon = BLOCK_ICONS[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onAdd(t);
                        onClose();
                      }}
                      className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-ink/40 hover:bg-paper-deep/60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper-deep text-ink-soft">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{BLOCK_TYPE_LABELS[t]}</span>
                        <span className="block truncate text-xs text-ink-faint">{BLOCK_TYPE_META[t].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {results.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-soft">No question type matches “{q}”.</p>
        )}
      </div>
    </Dialog>
  );
}

export function AddBlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink/40 hover:text-ink"
    >
      <Plus className="h-3.5 w-3.5" /> Add question
      <kbd className="ml-1 rounded border border-line-strong px-1 font-mono text-[10px] text-ink-faint">/</kbd>
    </button>
  );
}
