import { isAzureBackend } from "@/lib/backend";
import { withUserTransaction } from "@/lib/db/pool";
import { z } from "zod";
import { AI_PROMPT_MAX_CHARS } from "@/lib/ai/limits";
import { generateFormDraft, isAiConfigured } from "@/lib/ai/generate";
import { ensureMonthlyCredits, getAiBalance, refundCredits, spendCredits } from "@/lib/ai/credits";
import { AI_COST_PER_DRAFT } from "@/lib/plans";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { rowToBrandKit, type BrandKit } from "@/lib/brand/types";
import { getPlatformFlags } from "@/lib/platform";
import { formSchemaV1, formSettingsSchema } from "@/lib/forms/schema";
import { resolvePublicForm } from "@/lib/forms/public";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { McpToolError, type RegisteredTool, type ToolResult, type ToolContext } from "./protocol";

function text(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

// Allow only known settings and exclude owner notification addresses.
const agentSettingsSchema = formSettingsSchema.omit({ notifyEmails: true });
function agentSettings(settings: unknown) {
  const parsed = agentSettingsSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data : {};
}

/**
 * Same read as the brand studio's getBrandKit, minus the "use server"
 * module (which pulls next/headers and can't be unit-imported).
 */
async function getWorkspaceBrandKit(workspaceId: string, kitId: string, trustedActorId?: string): Promise<BrandKit | null> {
  if (isAzureBackend()) {
    if (!trustedActorId) return null;
    const row = await withUserTransaction(trustedActorId,async db => (await db.query("select * from brand_kits where workspace_id=$1 and id=$2",[workspaceId,kitId])).rows[0]);
    return row ? rowToBrandKit(row) : null;
  }
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

async function azureRead(ctx: ToolContext, sql: string, values: unknown[]) {
  if (!ctx.userId) throw new McpToolError("Invalid API credential.",-32603,"auth");
  return withUserTransaction(ctx.userId,async db => (await db.query(sql,values)).rows);
}

// list_forms -----------------------------------------------------------------

const listFormsInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
}).strict();

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
    if (isAzureBackend()) {
      const rows = await azureRead(ctx,"select id,title,slug,status,updated_at::text from forms where workspace_id=$1 order by updated_at desc,id limit $2",[ctx.workspaceId,limit]);
      return text({forms:rows.map(r=>({id:r.id,title:r.title,slug:r.slug,status:r.status,updatedAt:r.updated_at}))});
    }
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
  .strict()
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
      if ("error" in resolved || resolved.form.status !== "published") {
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
        settings: agentSettings(f.settings),
      });
    }
    if (isAzureBackend()) {
      const row = (await azureRead(ctx,"select id,title,slug,status,draft_schema,theme,settings from forms where workspace_id=$1 and id=$2",[ctx.workspaceId,args.formId]))[0];
      if (!row) throw new McpToolError("That form wasn't found.",-32602,"not_found");
      const parsed=formSchemaV1.safeParse(row.draft_schema);
      if(!parsed.success) throw new McpToolError("This draft can't be read right now.");
      return text({id:row.id,title:row.title,slug:row.slug,status:row.status,schema:parsed.data,theme:row.theme,settings:agentSettings(row.settings)});
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
      settings: agentSettings(row.settings),
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
}).strict();

const draftFormTool: RegisteredTool = {
  def: {
    name: "draft_form",
    description:
      "Draft a complete form from a plain-language description. Returns a validated schema + theme + settings draft — never saved or published. Costs 1 AI credit on success only.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", minLength: 10, maxLength: AI_PROMPT_MAX_CHARS, description: "What the form is for." },
        brandKitId: { type: ["string", "null"], format: "uuid", description: "Optional brand kit for on-brand styling." },
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
    const plan = await (isAzureBackend() ? getWorkspacePlan(ctx.workspaceId,ctx.userId) : getWorkspacePlan(ctx.workspaceId));
    await (isAzureBackend() ? ensureMonthlyCredits(ctx.workspaceId,plan,ctx.userId) : ensureMonthlyCredits(ctx.workspaceId,plan));
    const balance = await (isAzureBackend() ? getAiBalance(ctx.workspaceId,ctx.userId) : getAiBalance(ctx.workspaceId));
    if (balance < AI_COST_PER_DRAFT) {
      throw new McpToolError("Out of AI credits for now. Top up or upgrade to keep generating.", -32002, "no_credits");
    }
    const brand = args.brandKitId ? await getWorkspaceBrandKit(ctx.workspaceId, args.brandKitId,ctx.userId) : null;
    if (args.brandKitId && !brand) {
      throw new McpToolError("That brand kit wasn't found.", -32602, "invalid_params");
    }
    const spent = await (isAzureBackend() ? spendCredits(ctx.workspaceId,AI_COST_PER_DRAFT,"draft",ctx.userId) : spendCredits(ctx.workspaceId,AI_COST_PER_DRAFT,"draft"));
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
        balance: await (isAzureBackend() ? getAiBalance(ctx.workspaceId,ctx.userId) : getAiBalance(ctx.workspaceId)),
      });
    } catch {
      const ref=`mcp-draft-fail-${Date.now()}`;
      if(isAzureBackend()) await refundCredits(ctx.workspaceId,AI_COST_PER_DRAFT,ref,ctx.userId);
      else await refundCredits(ctx.workspaceId,AI_COST_PER_DRAFT,ref);
      throw new McpToolError(
        "Generation failed. Please try again.",
        -32603,
        "ai_unavailable",
      );
    }
  },
};

/** Every tool the server advertises. Planned tools stay in docs until live. */
export const MCP_TOOLS: RegisteredTool[] = [listFormsTool, getFormSchemaTool, draftFormTool];
