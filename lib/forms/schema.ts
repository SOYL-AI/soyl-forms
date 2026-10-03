import { z } from "zod";
import { SCHEMA_VERSION } from "@/types/forms";
import { FONT_IDS } from "./fonts";
import { extractFormulaRefs } from "./formula";

const blockId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Block id must be stable and URL-safe.");

const safeUrl = z
  .string()
  .max(2000)
  .refine(
    (v) => {
      if (v === "") return true;
      // Creator assets served from our own origin, or https elsewhere.
      if (v.startsWith("/api/public/assets/")) return true;
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Use an https URL." },
  );

const quizKey = z.object({
  correct: z.array(z.string().min(1).max(200)).max(50),
  points: z.number().int().min(0).max(100).optional(),
});

const baseBlock = {
  id: blockId,
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  required: z.boolean().optional(),
  imageUrl: safeUrl.optional(),
  imageAlt: z.string().max(200).optional(),
  quiz: quizKey.optional(),
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

/** Formulas reference questions as {id} with + - * / ( ) and numbers. */
export const FORMULA_PATTERN = /^[A-Za-z0-9_+\-*/().{}\s]+$/;

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
  formula: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => FORMULA_PATTERN.test(v) && (v.match(/\{[A-Za-z0-9_-]+\}/g) ?? []).length > 0, {
      message: "Use {question_id} references with + - * / ( ).",
    })
    .optional(),
});

const choiceOption = z.object({
  id: blockId,
  label: z.string().min(1).max(200),
  imageUrl: safeUrl.optional(),
});

const choiceBlock = (type: "single_choice" | "multiple_choice" | "dropdown") =>
  z.object({
    ...baseBlock,
    type: z.literal(type),
    options: z.array(choiceOption).min(2).max(50),
    allowOther: z.boolean().optional(),
    shuffle: z.boolean().optional(),
    minSelections: z.number().int().min(0).max(50).optional(),
    maxSelections: z.number().int().min(1).max(50).optional(),
  });

const yesNoBlock = z.object({ ...baseBlock, type: z.literal("yes_no") });

const ratingBlock = z.object({
  ...baseBlock,
  type: z.literal("rating"),
  max: z.union([z.literal(5), z.literal(10)]).optional(),
  icon: z.enum(["number", "star", "heart"]).optional(),
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
const timeBlock = z.object({ ...baseBlock, type: z.literal("time") });

const matrixBlock = z.object({
  ...baseBlock,
  type: z.literal("matrix"),
  rows: z.array(choiceOption).min(1).max(20),
  columns: z.array(choiceOption).min(2).max(10),
  multiple: z.boolean().optional(),
});

const rankingBlock = z.object({
  ...baseBlock,
  type: z.literal("ranking"),
  options: z.array(choiceOption).min(2).max(20),
});

const npsBlock = z.object({
  ...baseBlock,
  type: z.literal("nps"),
  minLabel: z.string().max(100).optional(),
  maxLabel: z.string().max(100).optional(),
});

const legalBlock = z.object({
  ...baseBlock,
  type: z.literal("legal"),
  acceptLabel: z.string().max(200).optional(),
  linkUrl: safeUrl.optional(),
  linkLabel: z.string().max(100).optional(),
});

const fileUploadBlock = z.object({
  ...baseBlock,
  type: z.literal("file_upload"),
  maxSizeMb: z.number().min(1).max(100).optional(),
  allowedMimes: z.array(z.string().max(100)).max(30).optional(),
});

const addressBlock = z.object({ ...baseBlock, type: z.literal("address") });

const sliderBlock = z.object({
  ...baseBlock,
  type: z.literal("slider"),
  min: z.number().int().min(0).max(1000).optional(),
  max: z.number().int().min(1).max(1001).optional(),
  minLabel: z.string().max(100).optional(),
  maxLabel: z.string().max(100).optional(),
});

const sectionBlock = z.object({
  ...baseBlock,
  type: z.literal("section"),
  buttonLabel: z.string().max(50).optional(),
});

const mediaBlock = z.object({
  ...baseBlock,
  type: z.literal("media"),
  mediaUrl: safeUrl.optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  caption: z.string().max(500).optional(),
});

const signatureBlock = z.object({ ...baseBlock, type: z.literal("signature") });

const paymentBlock = z.object({
  ...baseBlock,
  type: z.literal("payment"),
  amountPaise: z.number().int().min(100).max(100_000_000).optional(),
  amountFrom: blockId.optional(),
  description: z.string().max(500).optional(),
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
  buttonLabel: z.string().max(50).optional(),
  buttonUrl: safeUrl.optional(),
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
  timeBlock,
  matrixBlock,
  rankingBlock,
  npsBlock,
  legalBlock,
  fileUploadBlock,
  addressBlock,
  sliderBlock,
  sectionBlock,
  mediaBlock,
  signatureBlock,
  paymentBlock,
  statementBlock,
  thankYouBlock,
]);

export const logicOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "answered",
  "not_answered",
  "greater_than",
  "less_than",
]);

const logicConditionSchema = z.object({
  questionId: blockId,
  operator: logicOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]).optional(),
});

export const logicRuleSchema = z.object({
  id: blockId,
  when: logicConditionSchema,
  match: z.enum(["all", "any"]).optional(),
  conditions: z.array(logicConditionSchema).max(5).optional(),
  then: z.object({
    action: z.enum(["goto", "end", "hide"]),
    blockId: blockId.optional(),
  }),
});

const localeCode = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a locale like hi or pt-BR.");

const blockTranslationSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  buttonLabel: z.string().max(50).optional(),
  minLabel: z.string().max(100).optional(),
  maxLabel: z.string().max(100).optional(),
  acceptLabel: z.string().max(200).optional(),
  caption: z.string().max(500).optional(),
  options: z.record(z.string().min(1).max(200)).optional(),
  rows: z.record(z.string().min(1).max(200)).optional(),
  columns: z.record(z.string().min(1).max(200)).optional(),
});

export const formSchemaV1 = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().min(1).max(200),
  blocks: z.array(blockSchema).min(1).max(200),
  logic: z.array(logicRuleSchema).max(200).default([]),
  locales: z.array(localeCode).max(10).optional(),
  translations: z
    .record(
      z.object({
        title: z.string().min(1).max(200).optional(),
        blocks: z.record(blockTranslationSchema).optional(),
      }),
    )
    .optional(),
});

export type FormSchemaV1Input = z.infer<typeof formSchemaV1>;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color.");

/** Theme as stored on forms/versions. Unknown fonts fall back at render time. */
export const formThemeSchema = z.object({
  background: hexColor.optional(),
  text: hexColor.optional(),
  accent: hexColor.optional(),
  buttonStyle: z.enum(["rounded", "pill", "square"]).optional(),
  font: z.enum(["sans", "serif"]).optional(),
  headingFont: z.enum(FONT_IDS).optional(),
  bodyFont: z.enum(FONT_IDS).optional(),
  radius: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
  logoUrl: safeUrl.optional(),
  logoPlacement: z.enum(["top-left", "top-center"]).optional(),
  brandKitId: z.string().max(64).optional(),
});

const httpsUrl = z
  .string()
  .max(2000)
  .refine(
    (v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Use an https URL." },
  );

export const formSettingsSchema = z.object({
  showProgress: z.boolean().optional(),
  autoAdvance: z.boolean().optional(),
  allowMultipleSubmissions: z.boolean().optional(),
  closeAt: z.string().datetime({ offset: true }).nullable().optional(),
  submissionLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  closedMessage: z.string().max(500).optional(),
  collectQueryParams: z.boolean().optional(),
  buttonLabelNext: z.string().max(30).optional(),
  buttonLabelSubmit: z.string().max(30).optional(),
  redirectUrl: httpsUrl.nullable().optional(),
  notifyEmails: z.array(z.string().email().max(200)).max(5).optional(),
  hiddenFields: z
    .array(z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, "Hidden field keys must be URL-safe."))
    .max(20)
    .optional(),
  prefillEnabled: z.boolean().optional(),
  responderEnabled: z.boolean().optional(),
  responderSubject: z.string().max(200).optional(),
  responderMessage: z.string().max(2000).optional(),
  responderQuestionId: z.string().min(1).max(64).optional(),
  quizMode: z.boolean().optional(),
  showScore: z.boolean().optional(),
});

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
        block.type === "dropdown" ||
        block.type === "ranking") &&
      new Set(block.options.map((o) => o.id)).size !== block.options.length
    ) {
      errors.push(`Block "${block.id}" has duplicate option ids.`);
    }
    if (block.type === "matrix") {
      if (new Set(block.rows.map((o) => o.id)).size !== block.rows.length) {
        errors.push(`Block "${block.id}" has duplicate row ids.`);
      }
      if (new Set(block.columns.map((o) => o.id)).size !== block.columns.length) {
        errors.push(`Block "${block.id}" has duplicate column ids.`);
      }
    }
  }
  const locales = schema.locales ?? [];
  if (new Set(locales).size !== locales.length) errors.push("Duplicate locale.");
  for (const [locale, t] of Object.entries(schema.translations ?? {})) {
    if (!locales.includes(locale)) errors.push(`Translations for "${locale}" need the locale listed.`);
    for (const blockId of Object.keys(t.blocks ?? {})) {
      if (!ids.has(blockId)) errors.push(`Translations reference missing block "${blockId}".`);
    }
  }
  const numericIds = new Set(
    schema.blocks
      .filter((b) => b.type === "number" || b.type === "slider" || b.type === "rating" || b.type === "opinion_scale" || b.type === "nps")
      .map((b) => b.id),
  );
  for (const block of schema.blocks) {
    if (block.type === "number" && block.formula) {
      for (const ref of extractFormulaRefs(block.formula)) {
        if (ref === block.id) errors.push(`Calculation "${block.id}" can't reference itself.`);
        else if (!ids.has(ref)) errors.push(`Calculation "${block.id}" references missing question "${ref}".`);
        else if (!numericIds.has(ref)) errors.push(`Calculation "${block.id}" can only use numeric questions ("${ref}" isn't one).`);
      }
    }
  }
  const order = schema.blocks.map((b) => b.id);
  for (const block of schema.blocks) {
    if (block.type === "payment" && (block.amountPaise !== undefined) === (block.amountFrom !== undefined)) {
      errors.push(`Payment "${block.id}" needs either a fixed price or a linked amount question, not both.`);
      continue;
    }
    if (block.type === "payment" && block.amountFrom) {
      const src = schema.blocks.find((b) => b.id === block.amountFrom);
      const numeric = src && (src.type === "number" || src.type === "slider" || src.type === "rating" || src.type === "opinion_scale" || src.type === "nps");
      if (!src) errors.push(`Payment "${block.id}" links missing question "${block.amountFrom}".`);
      else if (!numeric) errors.push(`Payment "${block.id}" can only charge a numeric question ("${block.amountFrom}" isn't one).`);
      else if (order.indexOf(src.id) >= order.indexOf(block.id)) {
        errors.push(`Payment "${block.id}" must come after "${block.amountFrom}" so the amount is known.`);
      }
    }
  }
  const media = schema.blocks.find((b) => b.type === "media" && !b.mediaUrl);
  if (media) errors.push(`Media block "${media.id}" needs a media URL before publishing.`);
  const slider = schema.blocks.find((b) => b.type === "slider" && (b.min ?? 0) >= (b.max ?? 100));
  if (slider) errors.push(`Slider "${slider.id}" needs min below max.`);
  for (const rule of schema.logic) {
    const watched = [rule.when.questionId, ...(rule.conditions ?? []).map((c) => c.questionId)];
    for (const q of watched) {
      if (!ids.has(q)) errors.push(`Logic rule "${rule.id}" watches missing question "${q}".`);
    }
    if (rule.then.action === "end") {
      if (rule.then.blockId !== undefined) errors.push(`Logic rule "${rule.id}" ends the form and takes no target.`);
      continue;
    }
    const target = rule.then.blockId;
    if (!target || !ids.has(target)) {
      errors.push(`Logic rule "${rule.id}" ${rule.then.action === "hide" ? "hides" : "jumps to"} missing block "${target}".`);
      continue;
    }
    if (rule.then.action === "hide" && watched.includes(target)) {
      errors.push(`Logic rule "${rule.id}" hides the question it watches (form could stall).`);
    }
    if (rule.then.action === "goto" && rule.when.questionId === target) {
      errors.push(`Logic rule "${rule.id}" jumps to itself (infinite loop).`);
    }
  }
  return errors;
}
