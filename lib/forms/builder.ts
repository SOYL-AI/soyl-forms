import type { Block, BlockType, FormSchemaV1 } from "@/types/forms";

/** Stable, URL-safe block ids (`b_k3j8x2`). */
export function newBlockId(prefix = "b"): string {
  const rand = Math.floor(Math.random() * 36 ** 6).toString(36);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Blank-but-valid defaults for every V1 block type. */
export function createBlock(type: BlockType): Block {
  const id = newBlockId();
  switch (type) {
    case "welcome":
      return { id, type, title: "Welcome", description: "Takes about a minute.", buttonLabel: "Start" };
    case "short_text":
      return { id, type, title: "Untitled question", required: false, placeholder: "Type your answer…" };
    case "long_text":
      return { id, type, title: "Untitled question", required: false, placeholder: "Type your answer…" };
    case "email":
      return { id, type, title: "What's your email?", required: true, placeholder: "you@example.com" };
    case "phone":
      return { id, type, title: "What's your phone number?", required: false, placeholder: "+91 …" };
    case "url":
      return { id, type, title: "Your website or profile", required: false, placeholder: "https://" };
    case "number":
      return { id, type, title: "Pick a number", required: false };
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
      return {
        id, type, title: "Choose an option", required: true,
        options: [
          { id: `${id}_a`, label: "Option 1" },
          { id: `${id}_b`, label: "Option 2" },
        ],
      };
    case "yes_no":
      return { id, type, title: "Yes or no?", required: true };
    case "rating":
      return { id, type, title: "How would you rate this?", required: true, max: 5, icon: "star" };
    case "opinion_scale":
      return { id, type, title: "How much do you agree?", required: true, min: 0, max: 10, minLabel: "Not at all", maxLabel: "Completely" };
    case "date":
      return { id, type, title: "Pick a date", required: false };
    case "time":
      return { id, type, title: "Pick a time", required: false };
    case "matrix":
      return {
        id, type, title: "Rate each of the following", required: true,
        rows: [
          { id: `${id}_r1`, label: "Quality" },
          { id: `${id}_r2`, label: "Speed" },
          { id: `${id}_r3`, label: "Value" },
        ],
        columns: [
          { id: `${id}_c1`, label: "Poor" },
          { id: `${id}_c2`, label: "Okay" },
          { id: `${id}_c3`, label: "Good" },
          { id: `${id}_c4`, label: "Excellent" },
        ],
      };
    case "legal":
      return {
        id, type, title: "Before you continue", required: true,
        acceptLabel: "I agree to the terms and privacy policy",
      };
    case "file_upload":
      return { id, type, title: "Upload a file", required: false, maxSizeMb: 10 };
    case "statement":
      return { id, type, title: "One more thing…", buttonLabel: "Continue" };
    case "thank_you":
      return { id, type, title: "Thanks!", description: "Your response has been recorded." };
  }
}

/** Every new form starts as Welcome + one question + Thank you. */
export function buildStarterSchema(title: string): FormSchemaV1 {
  const welcome = createBlock("welcome");
  const first = { ...createBlock("short_text"), title: "What should we call you?", required: true } as Block;
  const thanks = createBlock("thank_you");
  return {
    schemaVersion: 1,
    title: title.trim() || "Untitled form",
    blocks: [welcome, first, thanks],
    logic: [],
  };
}

/** Reorder helper for drag-and-drop (active dragged over target). */
export function moveBlock<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
): T[] {
  const from = items.findIndex((i) => i.id === activeId);
  const to = items.findIndex((i) => i.id === overId);
  if (from === -1 || to === -1 || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Copy a block with fresh ids (options/rows/columns included); logic rules untouched. */
export function duplicateBlock(block: Block): Block {
  const id = newBlockId();
  const copy = JSON.parse(JSON.stringify(block)) as Block;
  (copy as { id: string }).id = id;
  if (
    (copy.type === "single_choice" ||
      copy.type === "multiple_choice" ||
      copy.type === "dropdown") &&
    Array.isArray(copy.options)
  ) {
    copy.options = copy.options.map((o, i) => ({
      ...o,
      id: `${id}_${i.toString(36)}`,
    }));
  }
  if (copy.type === "matrix") {
    copy.rows = copy.rows.map((o, i) => ({ ...o, id: `${id}_r${i.toString(36)}` }));
    copy.columns = copy.columns.map((o, i) => ({ ...o, id: `${id}_c${i.toString(36)}` }));
  }
  return copy;
}

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  welcome: "Welcome",
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  number: "Number",
  phone: "Phone",
  url: "Website",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  dropdown: "Dropdown",
  yes_no: "Yes / No",
  rating: "Rating",
  opinion_scale: "Opinion scale",
  date: "Date",
  time: "Time",
  matrix: "Grid",
  legal: "Consent",
  file_upload: "File upload",
  statement: "Statement",
  thank_you: "Thank you",
};

export type BlockGroup = "screens" | "text" | "choice" | "scale" | "input";

/** Palette grouping + one-line hints for the Add-block picker. */
export const BLOCK_TYPE_META: Record<BlockType, { group: BlockGroup; hint: string }> = {
  welcome: { group: "screens", hint: "Opening screen with a start button" },
  statement: { group: "screens", hint: "A message between questions" },
  thank_you: { group: "screens", hint: "Closing screen, optional link" },
  short_text: { group: "text", hint: "Names, one-liners" },
  long_text: { group: "text", hint: "Paragraph answers" },
  email: { group: "text", hint: "Validated email address" },
  phone: { group: "text", hint: "Phone number" },
  url: { group: "text", hint: "Link or profile" },
  number: { group: "text", hint: "Numeric with min/max" },
  single_choice: { group: "choice", hint: "Pick exactly one" },
  multiple_choice: { group: "choice", hint: "Pick any number" },
  dropdown: { group: "choice", hint: "Long lists, compact" },
  yes_no: { group: "choice", hint: "Two buttons" },
  legal: { group: "choice", hint: "Consent checkbox with link" },
  rating: { group: "scale", hint: "Stars or numbers 1–5 / 1–10" },
  opinion_scale: { group: "scale", hint: "0–10 with end labels" },
  matrix: { group: "scale", hint: "Rows × columns grid" },
  date: { group: "input", hint: "Calendar date" },
  time: { group: "input", hint: "Time of day" },
  file_upload: { group: "input", hint: "Files up to 100 MB" },
};

export const BLOCK_GROUP_LABELS: Record<BlockGroup, string> = {
  screens: "Screens",
  text: "Text & numbers",
  choice: "Choices",
  scale: "Scales & grids",
  input: "Date, time & files",
};
