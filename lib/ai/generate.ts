import { formSchemaV1, formSettingsSchema, formThemeSchema, validateLogicGraph } from "@/lib/forms/schema";
import { DEFAULT_THEME, resolveTheme } from "@/lib/forms/themes";
import { FONTS } from "@/lib/forms/fonts";
import { brandKitToTheme, type BrandKit } from "@/lib/brand/types";
import type { FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import { aiProvider, chatJson, extractJson, isAiConfigured } from "./client";

export { aiProvider, extractJson, isAiConfigured };

export const AI_MAX_BLOCKS = 30;

export type DraftLength = "short" | "medium" | "long";

export interface GenerateOptions {
  description: string;
  brand?: BrandKit | null;
  length?: DraftLength;
  /** Overrides the brand's tone ("playful", "formal", …). */
  tone?: string;
  /** Respondent-facing language, e.g. "English", "Hindi", "Hinglish". */
  language?: string;
}

export interface GeneratedDraft {
  schema: FormSchemaV1;
  theme: FormTheme;
  settings: FormSettings;
  logicDropped: boolean;
  rationale: string;
}

const LENGTH_HINT: Record<DraftLength, string> = {
  short: "3–5 questions",
  medium: "5–9 questions",
  long: "9–14 questions",
};

/**
 * System prompt: the model must emit ONLY one JSON object with the draft,
 * its theme and settings. Generation never publishes — output always lands
 * as an editable draft the creator reviews.
 */
export function buildFormPrompt(): string {
  const fontIds = FONTS.map((f) => `${f.id} (${f.feel})`).join(", ");
  return [
    "You design conversational, one-question-per-screen forms for a form builder. Reply with NOTHING but one JSON object.",
    'Shape: {"schema":FormSchemaV1,"theme":Theme,"settings":Settings,"rationale":string(<=200 chars)}.',
    'FormSchemaV1: {"schemaVersion":1,"title":string,"blocks":Block[],"logic":LogicRule[]}.',
    'Block (common): {"id":string,"type":string,"title":string,"description"?:string,"required"?:boolean}. ids: lowercase, letters/digits/underscore, unique, descriptive (e.g. "email", "team_size").',
    "Block types and extra fields:",
    ' welcome {"buttonLabel"?}, statement {"buttonLabel"?}, thank_you {"buttonLabel"?,"buttonUrl"?}',
    ' short_text/long_text/email/phone/url {"placeholder"?,"validation"?:{"maxLength"?,"minLength"?}}',
    ' number {"placeholder"?,"validation"?:{"min"?,"max"?}}',
    ' single_choice/multiple_choice/dropdown {"options":[{"id","label"}] (2–8), "allowOther"?:boolean, "shuffle"?:boolean}',
    " yes_no {}",
    ' rating {"max":5|10,"icon":"star"|"heart"|"number"}',
    ' opinion_scale {"min":0|1,"max":5|7|10,"minLabel"?,"maxLabel"?}',
    ' matrix {"rows":[{"id","label"}] (2–6), "columns":[{"id","label"}] (3–5), "multiple"?:boolean}  — rating several items on one scale; multiple=true for a checkbox grid',
    ' ranking {"options":[{"id","label"}] (3–7)}  — respondent orders options by preference',
    ' nps {"minLabel"?,"maxLabel"?}  — 0–10 "how likely to recommend"; prefer it over opinion_scale for recommendation questions',
    ' legal {"acceptLabel":string,"linkUrl"?:https,"linkLabel"?}  — consent/terms',
    " date {}, time {}, file_upload {\"maxSizeMb\":number}",
    'LogicRule: {"id":string,"when":{"questionId":string,"operator":"equals"|"not_equals"|"contains"|"answered"|"not_answered"|"greater_than"|"less_than","value"?:string},"then":{"action":"goto","blockId":string}}. Rules run in order, first match wins, else next block. Use the option id (not label) as value for choice questions; "yes"/"no" for yes_no; numbers as strings. Only add logic when a question is genuinely conditional (e.g. skip follow-ups after a "no").',
    'Theme: {"background":hex,"text":hex,"accent":hex,"headingFont":fontId,"bodyFont":fontId,"radius":"none"|"sm"|"md"|"lg"|"xl","buttonStyle":"pill"|"rounded"|"square"}. Allowed fontIds: ' +
      fontIds +
      ". Text must contrast strongly with background; accent must be a real brand-like colour, never grey. If a BRAND KIT is provided, use its colours, fonts and style exactly.",
    'Recall: a title or description may include {{questionId}} to show an earlier answer, e.g. "Thanks, {{name}}! What brings you here?" — only reference questions that come before it.',
    'Quiz: only when the request is a quiz, test or assessment, set settings.quizMode=true and add "quiz":{"correct":[optionId…] (or accepted texts for short_text),"points"?:number} to each graded single_choice, multiple_choice, dropdown, yes_no or short_text block.',
    'Settings: {"autoAdvance":boolean,"showProgress":boolean,"buttonLabelSubmit"?:string(<=20),"quizMode"?:boolean}.',
    "Writing: titles are short questions addressed to the respondent, in the brand's voice when given (else warm and plain). Descriptions are optional, one line, only when they add information. Use the most specific type available (email, phone, date, rating, matrix, legal). Mark only truly necessary questions required. Start with a welcome screen unless the form is under 4 questions; end with a thank_you whose title reflects what happens next.",
    "Never invent facts about the organisation. No markdown, no commentary, no trailing text.",
  ].join("\n");
}

function brandBlock(kit: BrandKit): string {
  const v = kit.voice;
  return [
    "BRAND KIT (follow exactly):",
    `Name: ${kit.name}`,
    kit.summary ? `About: ${kit.summary}` : "",
    v.tone ? `Tone of voice: ${v.tone}` : "",
    v.audience ? `Audience: ${v.audience}` : "",
    v.avoid.length ? `Avoid: ${v.avoid.join(", ")}` : "",
    v.sample ? `Sample on-brand copy: "${v.sample.slice(0, 300)}"` : "",
    `Colours: background ${kit.colors.background}, text ${kit.colors.text}, accent ${kit.colors.primary}${kit.colors.secondary ? `, secondary ${kit.colors.secondary}` : ""}`,
    `Fonts: heading ${kit.fonts.heading}, body ${kit.fonts.body}`,
    `Style: radius ${kit.style.radius}, buttons ${kit.style.buttonStyle}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(opts: GenerateOptions): string {
  const parts = [
    `Create a form for this request:\n${opts.description.trim().slice(0, 3000)}`,
    `Length: ${LENGTH_HINT[opts.length ?? "medium"]}.`,
  ];
  if (opts.tone) parts.push(`Tone override: ${opts.tone.slice(0, 80)}.`);
  if (opts.language) parts.push(`Write all respondent-facing text in ${opts.language.slice(0, 40)}.`);
  if (opts.brand) parts.push(brandBlock(opts.brand));
  else parts.push("No brand kit: choose a tasteful theme that suits the topic.");
  return parts.join("\n\n");
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Pre-validation repair: models often emit ids with spaces or punctuation.
 * Rewrite invalid ids (and every reference to them) before schema checks,
 * so one sloppy id can't sink an otherwise good draft.
 */
function sanitizeIds(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const root = raw as Record<string, unknown>;
  if (!Array.isArray(root.blocks)) return raw;
  const used = new Set<string>();
  const fresh = (fallback: string): string => {
    let id = fallback.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "q";
    let n = 1;
    while (used.has(id) || !ID_RE.test(id)) {
      n += 1;
      id = `${fallback.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 56)}_${n}`;
    }
    used.add(id);
    return id;
  };
  const blockMap = new Map<string, string>();
  const fixOptions = (list: unknown, prefix: string): unknown => {
    if (!Array.isArray(list)) return list;
    const seen = new Set<string>();
    return list.map((o, j) => {
      if (!o || typeof o !== "object" || Array.isArray(o)) return o;
      const opt = o as Record<string, unknown>;
      const oldId = typeof opt.id === "string" ? opt.id : "";
      let oid = oldId.replace(/[^A-Za-z0-9_-]/g, "_");
      if (!ID_RE.test(oid) || seen.has(oid)) {
        oid = `${prefix}_${j + 1}`;
        let k = 1;
        while (seen.has(oid)) {
          k += 1;
          oid = `${prefix}_${j + 1}_${k}`;
        }
      }
      seen.add(oid);
      if (oldId && oldId !== oid) blockMap.set(`${prefix}::${oldId}`, oid);
      return { ...opt, id: oid, label: String(opt.label ?? oid).slice(0, 200) || oid };
    });
  };
  const blocks = (root.blocks as unknown[]).map((b, i) => {
    if (!b || typeof b !== "object" || Array.isArray(b)) return b;
    const blk = b as Record<string, unknown>;
    const oldId = typeof blk.id === "string" ? blk.id : "";
    const newId = ID_RE.test(oldId) && !used.has(oldId) ? (used.add(oldId), oldId) : fresh(oldId || `q_${i + 1}`);
    if (oldId) blockMap.set(oldId, newId);
    const out: Record<string, unknown> = { ...blk, id: newId };
    if ("options" in blk) out.options = fixOptions(blk.options, `${newId}_o`);
    if ("rows" in blk) out.rows = fixOptions(blk.rows, `${newId}_r`);
    if ("columns" in blk) out.columns = fixOptions(blk.columns, `${newId}_c`);
    // Models sometimes send null for optional strings.
    for (const k of ["description", "placeholder", "buttonLabel", "buttonUrl", "linkUrl", "linkLabel", "minLabel", "maxLabel", "acceptLabel", "imageUrl"]) {
      if (out[k] === null || out[k] === "") delete out[k];
    }
    if (out.type === "thank_you") delete out.required;
    // Quiz keys reference option ids, which may have been rewritten above.
    const quiz = out.quiz as { correct?: unknown; points?: unknown } | null | undefined;
    if (quiz && typeof quiz === "object") {
      const list = Array.isArray(quiz.correct) ? quiz.correct : typeof quiz.correct === "string" ? [quiz.correct] : [];
      const correct = list
        .filter((c): c is string | number => typeof c === "string" || typeof c === "number")
        .map((c) => String(c))
        .map((c) => blockMap.get(`${newId}_o::${c}`) ?? c);
      out.quiz = correct.length ? { correct, ...(typeof quiz.points === "number" ? { points: quiz.points } : {}) } : undefined;
      if (!out.quiz) delete out.quiz;
    } else {
      delete out.quiz;
    }
    return out;
  });
  // Recall tokens ({{id}}) follow renamed block ids.
  for (const b of blocks) {
    if (!b || typeof b !== "object" || Array.isArray(b)) continue;
    const blk = b as Record<string, unknown>;
    for (const k of ["title", "description"]) {
      if (typeof blk[k] === "string") {
        blk[k] = (blk[k] as string).replace(/\{\{([^{}]{1,80})\}\}/g, (m, raw: string) => {
          const mapped = blockMap.get(raw.trim());
          return mapped ? `{{${mapped}}}` : m;
        });
      }
    }
  }
  let logic = root.logic;
  if (Array.isArray(logic)) {
    logic = (logic as unknown[]).map((r, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return r;
      const rule = r as Record<string, unknown>;
      const when = (rule.when ?? {}) as Record<string, unknown>;
      const then = (rule.then ?? {}) as Record<string, unknown>;
      const qid = typeof when.questionId === "string" ? blockMap.get(when.questionId) ?? when.questionId : when.questionId;
      let value = when.value;
      if (typeof value === "string" && typeof qid === "string") {
        value = blockMap.get(`${qid}_o::${value}`) ?? value;
      }
      if (typeof value === "number") value = String(value);
      return {
        id: typeof rule.id === "string" && ID_RE.test(rule.id) ? rule.id : `rule_${i + 1}`,
        when: { ...when, questionId: qid, value },
        then: {
          action: "goto",
          blockId: typeof then.blockId === "string" ? blockMap.get(then.blockId) ?? then.blockId : then.blockId,
        },
      };
    });
  } else {
    logic = [];
  }
  return { ...root, schemaVersion: 1, blocks, logic };
}

/**
 * Validate + normalize a generated schema: ids repaired, schema-checked,
 * block-capped, broken logic dropped (never a broken publish).
 */
export function parseGeneratedSchema(raw: unknown): {
  schema: FormSchemaV1;
  logicDropped: boolean;
} {
  const parsed = formSchemaV1.safeParse(sanitizeIds(raw));
  if (!parsed.success) {
    throw new Error("The AI draft failed validation — try rephrasing your description.");
  }
  const data = parsed.data;
  const blocks = data.blocks.slice(0, AI_MAX_BLOCKS);
  const ids = new Set(blocks.map((b) => b.id));
  // Keep only rules whose endpoints survived the cap; then validate the graph.
  let logic = data.logic.filter((r) => ids.has(r.when.questionId) && ids.has(r.then.blockId) && r.when.questionId !== r.then.blockId).slice(0, 50);
  const problems = validateLogicGraph({ ...data, blocks, logic });
  const logicDropped = problems.length > 0 || logic.length !== data.logic.length;
  if (problems.length > 0) logic = [];
  return {
    schema: { schemaVersion: 1, title: data.title, blocks, logic },
    logicDropped,
  };
}

/** Theme from the model, or from the brand kit when one was requested. */
export function parseGeneratedTheme(raw: unknown, brand?: BrandKit | null): FormTheme {
  if (brand) return brandKitToTheme(brand);
  const parsed = formThemeSchema.safeParse(raw ?? {});
  const theme: FormTheme = parsed.success ? parsed.data : { ...DEFAULT_THEME };
  // Persist contrast-corrected colours so the stored draft is legible as-is.
  const resolved = resolveTheme(theme);
  return {
    ...theme,
    background: resolved.background,
    text: resolved.text,
    accent: resolved.accent,
    headingFont: resolved.heading.id,
    bodyFont: resolved.body.id,
    radius: resolved.radius,
    buttonStyle: resolved.buttonStyle,
  };
}

export function parseGeneratedSettings(raw: unknown): FormSettings {
  const parsed = formSettingsSchema.safeParse(raw ?? {});
  const s = parsed.success ? parsed.data : {};
  return {
    autoAdvance: s.autoAdvance ?? true,
    showProgress: s.showProgress ?? true,
    ...(s.buttonLabelSubmit ? { buttonLabelSubmit: s.buttonLabelSubmit } : {}),
    ...(s.quizMode ? { quizMode: true } : {}),
  };
}

/** Call the provider and return a validated draft. Throws with safe messages. */
export async function generateFormDraft(opts: GenerateOptions): Promise<GeneratedDraft> {
  if (!isAiConfigured()) {
    throw new Error("AI generation isn't connected (missing provider key).");
  }
  const prompt = opts.description.trim();
  if (prompt.length < 10) {
    throw new Error("Describe your form in a sentence or two first.");
  }
  const content = await chatJson({
    system: buildFormPrompt(),
    user: buildUserPrompt(opts),
    maxTokens: 6000,
    temperature: 0.5,
  });
  const json = extractJson(content) as Record<string, unknown>;
  // Tolerate models that return the schema at the top level.
  const schemaRaw = json.schema && typeof json.schema === "object" ? json.schema : json;
  const { schema, logicDropped } = parseGeneratedSchema(schemaRaw);
  return {
    schema,
    theme: parseGeneratedTheme(json.theme, opts.brand),
    settings: parseGeneratedSettings(json.settings),
    logicDropped,
    rationale: typeof json.rationale === "string" ? json.rationale.slice(0, 200) : "",
  };
}
