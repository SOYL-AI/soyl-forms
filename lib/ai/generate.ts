import { formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import type { FormSchemaV1 } from "@/types/forms";

export const AI_MAX_BLOCKS = 25;

export type AiProvider = "openai" | "azure-foundry" | "azure-openai";

/**
 * Provider selection:
 * - `openai` (default): any OpenAI-compatible `/chat/completions` + Bearer key.
 * - `azure-foundry`: Azure AI Foundry serverless inference
 *   (`https://<resource>.services.ai.azure.com/models` + Bearer key) — same
 *   OpenAI-compatible wire format, deployment name in AI_MODEL.
 * - `azure-openai`: classic Azure OpenAI
 *   (`https://<resource>.openai.azure.com`, AI_MODEL = deployment name,
 *   `api-key` header + api-version query).
 */
export function aiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (raw === "azure-foundry" || raw === "azure_foundry") return "azure-foundry";
  if (raw === "azure-openai" || raw === "azure_openai") return "azure-openai";
  return "openai";
}

/** True when an AI provider is configured. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
}

function baseUrl(): string {
  const provider = aiProvider();
  const fallback =
    provider === "azure-openai"
      ? "https://YOUR-RESOURCE.openai.azure.com"
      : provider === "azure-foundry"
        ? "https://YOUR-RESOURCE.services.ai.azure.com/models"
        : "https://api.openai.com/v1";
  return (process.env.AI_BASE_URL ?? fallback).replace(/\/+$/, "");
}

function endpointUrl(model: string): string {
  if (aiProvider() === "azure-openai") {
    const version = process.env.AI_API_VERSION ?? "2024-10-21";
    return `${baseUrl()}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${version}`;
  }
  return `${baseUrl()}/chat/completions`;
}

function authHeaders(): Record<string, string> {
  if (aiProvider() === "azure-openai") {
    return { "api-key": process.env.AI_API_KEY as string };
  }
  return { authorization: `Bearer ${process.env.AI_API_KEY}` };
}

/**
 * System prompt: the model must emit ONLY a FormSchemaV1 JSON object.
 * Generation never publishes — output always lands as an editable draft.
 */
export function buildFormPrompt(): string {
  return [
    "You generate form definitions as strict JSON. Reply with NOTHING but the JSON object.",
    "Schema: {\"schemaVersion\":1,\"title\":string,\"blocks\":Block[],\"logic\":[]}.",
    "Block: {\"id\":string-url-safe-stable,\"type\":one-of-below,\"title\":string,\"description\"?:string,\"required\"?:boolean}.",
    'Types: welcome, short_text, long_text, email, number, phone, url, single_choice, multiple_choice, dropdown, yes_no, rating, opinion_scale, date, statement, thank_you. (Never file_upload.)',
    "Choice blocks need \"options\":[{\"id\":string,\"label\":string}] with 2-6 options and stable ids.",
    "Rating uses {\"max\":5}. Opinion scale uses {\"min\":0,\"max\":10}.",
    "Structure: start with a welcome block, then 4-10 questions (mark truly-necessary ones required), end with thank_you.",
    "Keep \"logic\":[] always. Titles under 120 chars. No markdown, no commentary.",
  ].join("\n");
}

/** Extract the JSON object from model output (tolerates code fences). */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
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
    let id = fallback;
    let n = 1;
    while (used.has(id) || !ID_RE.test(id)) {
      n += 1;
      id = `${fallback.slice(0, 56)}_${n}`;
    }
    used.add(id);
    return id;
  };
  const blockMap = new Map<string, string>();
  const blocks = (root.blocks as unknown[]).map((b, i) => {
    if (!b || typeof b !== "object" || Array.isArray(b)) return b;
    const blk = b as Record<string, unknown>;
    const oldId = typeof blk.id === "string" ? blk.id : "";
    const newId = ID_RE.test(oldId) && !used.has(oldId)
      ? (used.add(oldId), oldId)
      : fresh(`q_${i + 1}`);
    if (oldId) blockMap.set(oldId, newId);
    const out: Record<string, unknown> = { ...blk, id: newId };
    if (Array.isArray(blk.options)) {
      const seenOpt = new Set<string>();
      out.options = (blk.options as unknown[]).map((o, j) => {
        if (!o || typeof o !== "object" || Array.isArray(o)) return o;
        const opt = o as Record<string, unknown>;
        const oldOid = typeof opt.id === "string" ? opt.id : "";
        let oid = oldOid;
        if (!ID_RE.test(oid) || seenOpt.has(oid)) {
          oid = `${newId}_o${j}`;
          let k = 1;
          while (seenOpt.has(oid)) {
            k += 1;
            oid = `${newId}_o${j}_${k}`;
          }
        }
        seenOpt.add(oid);
        return { ...opt, id: oid };
      });
    }
    return out;
  });
  let logic = root.logic;
  if (Array.isArray(logic)) {
    logic = (logic as unknown[]).map((r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return r;
      const rule = r as Record<string, unknown>;
      const when = (rule.when ?? {}) as Record<string, unknown>;
      const then = (rule.then ?? {}) as Record<string, unknown>;
      return {
        ...rule,
        when: {
          ...when,
          questionId:
            typeof when.questionId === "string" && blockMap.has(when.questionId)
              ? blockMap.get(when.questionId)
              : when.questionId,
        },
        then: {
          ...then,
          blockId:
            typeof then.blockId === "string" && blockMap.has(then.blockId)
              ? blockMap.get(then.blockId)
              : then.blockId,
        },
      };
    });
  }
  return { ...root, blocks, logic };
}

/**
 * Validate + normalize a generated draft: ids repaired, schema-checked,
 * block-capped, broken logic dropped.
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
  const seen = new Set<string>();
  const cleanId = (id: string, fallback: string): string => {
    let safe = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || fallback;
    let n = 1;
    while (seen.has(safe)) {
      n += 1;
      safe = `${safe.slice(0, 60)}_${n}`;
    }
    seen.add(safe);
    return safe;
  };
  const idMap = new Map<string, string>();
  for (const b of blocks) {
    idMap.set(b.id, cleanId(b.id, `q_${seen.size + 1}`));
  }
  const normalized = blocks.map((b) => {
    const next = { ...b, id: idMap.get(b.id) as string };
    if (
      (next.type === "single_choice" ||
        next.type === "multiple_choice" ||
        next.type === "dropdown") &&
      Array.isArray(next.options)
    ) {
      const used = new Set<string>();
      next.options = next.options.map((o, i) => {
        let oid = o.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || `${next.id}_o${i}`;
        let k = 1;
        while (used.has(oid)) {
          k += 1;
          oid = `${oid.slice(0, 60)}_${k}`;
        }
        used.add(oid);
        return { ...o, id: oid };
      });
    }
    return next;
  });

  let logic = data.logic
    .map((r) => ({
      ...r,
      when: { ...r.when, questionId: idMap.get(r.when.questionId) ?? r.when.questionId },
      then: { ...r.then, blockId: idMap.get(r.then.blockId) ?? r.then.blockId },
    }))
    .slice(0, 50);
  const problems = validateLogicGraph({ ...data, blocks: normalized, logic });
  const logicDropped = problems.length > 0;
  if (logicDropped) logic = [];

  return {
    schema: { schemaVersion: 1, title: data.title, blocks: normalized, logic },
    logicDropped,
  };
}

/** Call the provider and return a validated draft. Throws with safe messages. */
export async function generateFormDraft(
  description: string,
): Promise<{ schema: FormSchemaV1; logicDropped: boolean }> {
  if (!isAiConfigured()) {
    throw new Error("AI generation isn't connected (missing AI_API_KEY / AI_MODEL).");
  }
  const prompt = description.trim().slice(0, 2000);
  if (prompt.length < 10) {
    throw new Error("Describe your form in a sentence or two first.");
  }
  const model = process.env.AI_MODEL as string;
  const res = await fetch(endpointUrl(model), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: "system", content: buildFormPrompt() },
        { role: "user", content: `Create a form for this request:\n${prompt}` },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error("The AI provider refused the request. Try again in a bit.");
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI provider returned nothing usable.");
  return parseGeneratedSchema(extractJson(content));
}
