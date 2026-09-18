"use client";

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
import type { Block, BlockType } from "@/types/forms";
import { BLOCK_TYPE_LABELS } from "@/lib/forms/builder";
import { cn } from "@/lib/utils";

function SortableRow({
  block,
  selected,
  onSelect,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: block.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left",
        selected
          ? "border-brand-700 bg-brand-50"
          : "border-ink/10 bg-white hover:border-ink/25",
      )}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${block.title}`}
        className="cursor-grab touch-none px-1 text-ink-faint active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {BLOCK_TYPE_LABELS[block.type]}
        </span>
        <span className="block truncate text-sm font-medium">{block.title}</span>
      </button>
    </li>
  );
}

export function Outline({
  blocks,
  selectedId,
  onSelect,
  onReorder,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) {
      onReorder(String(e.active.id), String(e.over.id));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1.5" aria-label="Form questions">
          {blocks.map((b) => (
            <SortableRow
              key={b.id}
              block={b}
              selected={b.id === selectedId}
              onSelect={() => onSelect(b.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

const PALETTE: BlockType[] = [
  "welcome",
  "short_text",
  "long_text",
  "email",
  "number",
  "phone",
  "url",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "yes_no",
  "rating",
  "opinion_scale",
  "date",
  "file_upload",
  "statement",
  "thank_you",
];

export function AddBlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
        Add block
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {PALETTE.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAdd(t)}
            className="rounded-xl border border-ink/10 bg-white px-2.5 py-2 text-left text-xs font-medium transition-colors hover:border-brand-600/60 hover:bg-brand-50/50"
          >
            + {BLOCK_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
