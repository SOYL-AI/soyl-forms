import { z } from "zod";
import { SCHEMA_VERSION } from "@/types/forms";

const blockId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Block id must be stable and URL-safe.");

const baseBlock = {
  id: blockId,
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  required: z.boolean().optional(),
};

const welcomeBlock = z.object({
  ...baseBlock,
  type: z.literal("welcome"),
  buttonLabel: z.string().max(50).optional(),
});

const textBlock = (type: "short_text" | "long_text" | "email" | "phone" | "url") =>
  z.object({
    ...baseBlock,
    type: z.literal(type),
    placeholder: z.string().max(200).optional(),
    validation: z
      .object({
        maxLength: z.number().int().min(1).max(10000).optional(),
        minLength: z.number().int().min(0).max(10000).optional(),
        pattern: z.string().max(500).optional(),
      })
      .optional(),
  });

const numberBlock = z.object({
  ...baseBlock,
  type: z.literal("number"),
  placeholder: z.string().max(200).optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
});

const choiceOption = z.object({
  id: blockId,
  label: z.string().min(1).max(200),
});

const choiceBlock = (type: "single_choice" | "multiple_choice" | "dropdown") =>
  z.object({
    ...baseBlock,
    type: z.literal(type),
    options: z.array(choiceOption).min(2).max(50),
    allowOther: z.boolean().optional(),
  });

const yesNoBlock = z.object({ ...baseBlock, type: z.literal("yes_no") });

const ratingBlock = z.object({
  ...baseBlock,
  type: z.literal("rating"),
  max: z.union([z.literal(5), z.literal(10)]).optional(),
});

const opinionScaleBlock = z.object({
  ...baseBlock,
  type: z.literal("opinion_scale"),
  min: z.number().int().min(0).max(10).optional(),
  max: z.number().int().min(1).max(11).optional(),
  minLabel: z.string().max(100).optional(),
  maxLabel: z.string().max(100).optional(),
});

const dateBlock = z.object({ ...baseBlock, type: z.literal("date") });

const fileUploadBlock = z.object({
  ...baseBlock,
  type: z.literal("file_upload"),
  maxSizeMb: z.number().min(1).max(100).optional(),
  allowedMimes: z.array(z.string().max(100)).max(30).optional(),
});

const statementBlock = z.object({
  ...baseBlock,
  type: z.literal("statement"),
  buttonLabel: z.string().max(50).optional(),
});

const thankYouBlock = z.object({
  ...baseBlock,
  type: z.literal("thank_you"),
  required: z.never().optional(),
});

export const blockSchema = z.discriminatedUnion("type", [
  welcomeBlock,
  textBlock("short_text"),
  textBlock("long_text"),
  textBlock("email"),
  textBlock("phone"),
  textBlock("url"),
  numberBlock,
  choiceBlock("single_choice"),
  choiceBlock("multiple_choice"),
  choiceBlock("dropdown"),
  yesNoBlock,
  ratingBlock,
  opinionScaleBlock,
  dateBlock,
  fileUploadBlock,
  statementBlock,
  thankYouBlock,
]);

export const logicRuleSchema = z.object({
  id: blockId,
  when: z.object({
    questionId: blockId,
    operator: z.enum(["equals", "not_equals", "contains", "answered"]),
    value: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  then: z.object({
    action: z.literal("goto"),
    blockId: blockId,
  }),
});

export const formSchemaV1 = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().min(1).max(200),
  blocks: z.array(blockSchema).min(1).max(200),
  logic: z.array(logicRuleSchema).max(200).default([]),
});

export type FormSchemaV1Input = z.infer<typeof formSchemaV1>;

/**
 * Structural publish-blockers beyond field shapes: duplicate ids,
 * logic jumps to missing blocks, and self-loops.
 */
export function validateLogicGraph(schema: FormSchemaV1Input): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const block of schema.blocks) {
    if (ids.has(block.id)) errors.push(`Duplicate block id "${block.id}".`);
    ids.add(block.id);
    if (
      (block.type === "single_choice" ||
        block.type === "multiple_choice" ||
        block.type === "dropdown") &&
      new Set(block.options.map((o) => o.id)).size !== block.options.length
    ) {
      errors.push(`Block "${block.id}" has duplicate option ids.`);
    }
  }
  for (const rule of schema.logic) {
    if (!ids.has(rule.when.questionId)) {
      errors.push(
        `Logic rule "${rule.id}" watches missing question "${rule.when.questionId}".`,
      );
    }
    if (!ids.has(rule.then.blockId)) {
      errors.push(
        `Logic rule "${rule.id}" jumps to missing block "${rule.then.blockId}".`,
      );
    }
    if (rule.when.questionId === rule.then.blockId) {
      errors.push(`Logic rule "${rule.id}" jumps to itself (infinite loop).`);
    }
  }
  return errors;
}
