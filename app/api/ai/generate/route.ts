import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { generateFormDraft, isAiConfigured } from "@/lib/ai/generate";
import { ensureMonthlyCredits, getAiBalance, refundCredits, spendCredits } from "@/lib/ai/credits";
import { AI_COST_PER_DRAFT } from "@/lib/plans";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { getBrandKit } from "@/lib/brand/actions";
import { getPlatformFlags } from "@/lib/platform";

const generateSchema = z.object({
  description: z.string().min(10).max(3000),
  brandKitId: z.string().uuid().nullable().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  tone: z.string().max(80).optional(),
  language: z.string().max(40).optional(),
});

/**
 * Describe a form → validated draft (schema + theme + settings). Costs one
 * credit only when the provider succeeds. The draft is NEVER saved or
 * published here — the client previews it and decides.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(`ai:${userId}:${ip}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });

  const flags = await getPlatformFlags();
  if (!flags.aiEnabled) {
    return NextResponse.json({ error: "AI generation is paused right now." }, { status: 503 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI generation isn't connected yet — the app owner needs to add a provider key." },
      { status: 503 },
    );
  }

  const body = generateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Describe the form you want in a sentence or two." }, { status: 400 });
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace yet." }, { status: 400 });

  const plan = await getWorkspacePlan(workspaceId);
  await ensureMonthlyCredits(workspaceId, plan);
  const balance = await getAiBalance(workspaceId);
  if (balance < AI_COST_PER_DRAFT) {
    return NextResponse.json(
      { error: "You're out of AI credits for now. Top up or upgrade to keep generating.", balance },
      { status: 402 },
    );
  }

  const brand = body.data.brandKitId ? await getBrandKit(workspaceId, body.data.brandKitId) : null;
  if (body.data.brandKitId && !brand) {
    return NextResponse.json({ error: "That brand kit wasn't found." }, { status: 404 });
  }

  // Reserve the credit first (atomic), refund on provider failure.
  const spent = await spendCredits(workspaceId, AI_COST_PER_DRAFT, "draft");
  if (!spent) {
    return NextResponse.json({ error: "You're out of AI credits. Top up to keep generating." }, { status: 402 });
  }
  try {
    const draft = await generateFormDraft({
      description: body.data.description,
      brand,
      length: body.data.length,
      tone: body.data.tone,
      language: body.data.language,
    });
    return NextResponse.json({
      ok: true,
      schema: draft.schema,
      theme: draft.theme,
      settings: draft.settings,
      logicDropped: draft.logicDropped,
      rationale: draft.rationale,
      balance: await getAiBalance(workspaceId),
    });
  } catch (e) {
    await refundCredits(workspaceId, AI_COST_PER_DRAFT, `draft-fail-${Date.now()}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed.", balance: await getAiBalance(workspaceId) },
      { status: 502 },
    );
  }
}
