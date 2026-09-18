import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { generateFormDraft, isAiConfigured } from "@/lib/ai/generate";
import {
  AI_COST_PER_DRAFT,
  AI_FREE_MONTHLY_CREDITS,
} from "@/lib/plans";
import { getAiBalance, getUserWorkspaceId } from "@/lib/workspaces";

const generateSchema = z.object({
  description: z.string().min(10).max(2000),
});

function monthRef(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Dictate a form: spend 1 credit (after monthly free grant), generate a
 * validated draft. The draft is NEVER published automatically — the client
 * saves it into the builder for review.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(`ai:${userId}:${ip}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI generation isn't connected yet (missing AI_API_KEY / AI_MODEL)." },
      { status: 503 },
    );
  }

  const body = generateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Describe the form you want in a sentence or two." },
      { status: 400 },
    );
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  }
  const admin = getServiceSupabase();

  // Monthly free grant (race-safe: unique ledger key per workspace+month).
  await admin!.rpc("grant_ai_credits", {
    p_workspace_id: workspaceId,
    p_amount: AI_FREE_MONTHLY_CREDITS,
    p_reason: "monthly",
    p_ref: monthRef(),
  });
  const balance = await getAiBalance(workspaceId);
  if (balance < AI_COST_PER_DRAFT) {
    return NextResponse.json(
      { error: "You're out of AI credits. Top up to keep generating.", balance },
      { status: 402 },
    );
  }

  let draft;
  try {
    draft = await generateFormDraft(body.data.description);
  } catch (e) {
    // Provider/validation failures never burn a credit.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed." },
      { status: 502 },
    );
  }

  const { data: spent } = await admin!.rpc("spend_ai_credits", {
    p_workspace_id: workspaceId,
    p_amount: AI_COST_PER_DRAFT,
    p_reason: "draft",
  });
  if (!spent) {
    return NextResponse.json({ error: "You're out of AI credits. Top up to keep generating." }, { status: 402 });
  }

  return NextResponse.json({
    ok: true,
    schema: draft.schema,
    logicDropped: draft.logicDropped,
    balance: await getAiBalance(workspaceId),
  });
}
