import { describe, expect, it } from "vitest";
import { blockSchema, formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import {
  BLOCK_TYPE_LABELS,
  buildStarterSchema,
  createBlock,
  duplicateBlock,
  moveBlock,
  newBlockId,
} from "@/lib/forms/builder";
import type { BlockType } from "@/types/forms";

const ALL_TYPES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[];

describe("builder helpers", () => {
  it("generates unique URL-safe ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newBlockId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it("creates a valid block for every V1 type", () => {
    for (const type of ALL_TYPES) {
      const parsed = blockSchema.safeParse(createBlock(type));
      expect(parsed.success, `type ${type} should validate`).toBe(true);
    }
  });

  it("builds a valid starter schema (welcome + question + thanks)", () => {
    const schema = buildStarterSchema("My form");
    expect(formSchemaV1.safeParse(schema).success).toBe(true);
    expect(validateLogicGraph(schema)).toEqual([]);
    expect(schema.blocks[0]?.type).toBe("welcome");
    expect(schema.blocks[schema.blocks.length - 1]?.type).toBe("thank_you");
    expect(schema.blocks.length).toBe(3);
  });

  it("reorders blocks by drag ids", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveBlock(items, "c", "a").map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(moveBlock(items, "a", "a")).toBe(items);
    expect(moveBlock(items, "ghost", "a")).toBe(items);
  });

  it("duplicates with fresh block and option ids", () => {
    const original = createBlock("single_choice");
    if (original.type !== "single_choice") throw new Error("fixture");
    const copy = duplicateBlock(original);
    expect(copy.id).not.toBe(original.id);
    if (copy.type !== "single_choice") throw new Error("copy type");
    expect(copy.options.map((o) => o.id)).not.toEqual(
      original.options.map((o) => o.id),
    );
    expect(copy.options.map((o) => o.label)).toEqual(
      original.options.map((o) => o.label),
    );
    expect(blockSchema.safeParse(copy).success).toBe(true);
  });
});
