import { z } from "zod";
import { AI_PROMPT_MAX_CHARS } from "@/lib/ai/limits";
import { generateFormDraft, isAiConfigured } from "@/lib/ai/generate";
import { ensureMonthlyCredits, getAiBalance, refundCredits, spendCredits } from "@/lib/ai/credits";
import { AI_COST_PER_DRAFT } from "@/lib/plans";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { rowToBrandKit, type BrandKit } from "@/lib/brand/types";
import { getPlatformFlags } from "@/lib/platform";
import { formSchemaV1 } from "@/lib/forms/schema";
import { resolvePublicForm } from "@/lib/forms/public";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { McpToolError, type RegisteredTool, type ToolResult } from "./protocol";

function text(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/**
 * Same read as the brand studio's getBrandKit, minus the "use server"
 * module (which pulls next/headers and can't be unit-imported).
 */
async function getWorkspaceBrandKit(workspaceId: string, kitId: string): Promise<BrandKit | null> {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("brand_kits")
    .select("*")
    .eq("id", kitId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  try {
    return rowToBrandKit(data);
  } catch {
    return null;
  }
}

// list_forms -----------------------------------------------------------------

const listFormsInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

const listFormsTool: RegisteredTool = {
  def: {
    name: "list_forms",
    description: "List this workspace's forms, newest first. Returns id, title, slug, status and updatedAt.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Max forms to return." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  schema: listFormsInput,
  run: async (ctx, input) => {
    const { limit } = input as z.infer<typeof listFormsInput>;
    const admin = getServiceSupabase();
    if (!admin) throw new McpToolError("Forms are temporarily unavailable.", -32603, "internal");
    const { data, error } = await admin
      .from("forms")
      .select("id, title, slug, status, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new McpToolError("Forms are temporarily unavailable.", -32603, "internal");
    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      slug: string;
      status: string;
      updated_at: string;
    }>;
    return text({
      forms: rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        updatedAt: r.updated_at,
      })),
    });
  },
};

// get_form_schema --------------------------------------------------------------

const getFormSchemaInput = z
  .object({
    formId: z.string().uuid().optional(),
    slug: z.string().min(1).max(120).optional(),
  })
  .refine((v) => Number(Boolean(v.formId)) + Number(Boolean(v.slug)) === 1, {
    message: "Provide exactly one of `formId` or `slug`.",
  });

const getFormSchemaTool: RegisteredTool = {
  def: {
    name: "get_form_schema",
    description:
      "Fetch one form's question schema. Use formId for a workspace-owned draft, or slug for any public published form.",
    inputSchema: {
      type: "object",
      properties: {
        formId: { type: "string", format: "uuid", description: "Workspace-owned form id (draft schema)." },
        slug: { type: "string", description: "Public slug (published schema)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  schema: getFormSchemaInput,
  run: async (ctx, input) => {
    const args = input as z.infer<typeof getFormSchemaInput>;
    if (args.slug) {
      const resolved = await resolvePublicForm(args.slug);
      if ("error" in resolved) {
        throw new McpToolError("That form isn't available.", -32602, "not_found");
      }
      const f = resolved.form;
      return text({
        id: f.id,
        title: f.title,
        slug: f.slug,
        status: f.status,
        schema: f.schema,
        theme: f.theme,
        settings: f.settings,
      });
    }
    const admin = getServiceSupabase();
    if (!admin) throw new McpToolError("Forms are temporarily unavailable.", -32603, "internal");
    const { data } = await admin
      .from("forms")
      .select("id, title, slug, status, draft_schema, theme, settings")
      .eq("id", args.formId as string)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    const row = data as {
      id: string;
      title: string;
      slug: string;
      status: string;
      draft_schema: unknown;
      theme: unknown;
      settings: unknown;
    } | null;
    if (!row) throw new McpToolError("That form wasn't found.", -32602, "not_found");
    const parsed = formSchemaV1.safeParse(row.draft_schema);
    if (!parsed.success) {
      throw new McpToolError("This draft can't be read right now.", -32603, "internal");
    }
    return text({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      schema: parsed.data,
      theme: row.theme,
      settings: row.settings,
    });
  },
};

// draft_form -------------------------------------------------------------------

const draftFormInput = z.object({
  description: z.string().min(10).max(AI_PROMPT_MAX_CHARS),
  brandKitId: z.string().uuid().nullable().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  tone: z.string().max(80).optional(),
  language: z.string().max(40).optional(),
});

const draftFormTool: RegisteredTool = {
  def: {
    name: "draft_form",
    description:
      "Draft a complete form from a plain-language description. Returns a validated schema + theme + settings draft — never saved or published. Costs 1 AI credit on success only.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", minLength: 10, maxLength: AI_PROMPT_MAX_CHARS, description: "What the form is for." },
        brandKitId: { type: "string", format: "uuid", description: "Optional brand kit for on-brand styling." },
        length: { type: "string", enum: ["short", "medium", "long"], description: "Draft size (default medium)." },
        tone: { type: "string", maxLength: 80, description: "Tone override, e.g. formal, playful." },
        language: { type: "string", maxLength: 40, description: "Respondent-facing language, e.g. Hindi." },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  schema: draftFormInput,
  run: async (ctx, input) => {
    const args = input as z.infer<typeof draftFormInput>;
    const flags = await getPlatformFlags();
    if (!flags.aiEnabled) {
      throw new McpToolError("AI generation is paused right now.", -32603, "ai_unavailable");
    }
    if (!isAiConfigured()) {
      throw new McpToolError("AI drafting is temporarily unavailable.", -32603, "ai_unavailable");
    }
    const plan = await getWorkspacePlan(ctx.workspaceId);
    await ensureMonthlyCredits(ctx.workspaceId, plan);
    const balance = await getAiBalance(ctx.workspaceId);
    if (balance < AI_COST_PER_DRAFT) {
      throw new McpToolError("Out of AI credits for now. Top up or upgrade to keep generating.", -32002, "no_credits");
    }
    const brand = args.brandKitId ? await getWorkspaceBrandKit(ctx.workspaceId, args.brandKitId) : null;
    if (args.brandKitId && !brand) {
      throw new McpToolError("That brand kit wasn't found.", -32602, "invalid_params");
    }
    const spent = await spendCredits(ctx.workspaceId, AI_COST_PER_DRAFT, "draft");
    if (!spent) {
      throw new McpToolError("Out of AI credits for now. Top up or upgrade to keep generating.", -32002, "no_credits");
    }
    try {
      const draft = await generateFormDraft({
        description: args.description,
        brand,
        length: args.length,
        tone: args.tone,
        language: args.language,
      });
      return text({
        schema: draft.schema,
        theme: draft.theme,
        settings: draft.settings,
        logicDropped: draft.logicDropped,
        rationale: draft.rationale,
        balance: await getAiBalance(ctx.workspaceId),
      });
    } catch (e) {
      await refundCredits(ctx.workspaceId, AI_COST_PER_DRAFT, `mcp-draft-fail-${Date.now()}`);
      throw new McpToolError(
        e instanceof Error ? e.message.slice(0, 300) : "Generation failed.",
        -32603,
        "ai_unavailable",
      );
    }
  },
};

/** Every tool the server advertises. Planned tools stay in docs until live. */
export const MCP_TOOLS: RegisteredTool[] = [listFormsTool, getFormSchemaTool, draftFormTool];
