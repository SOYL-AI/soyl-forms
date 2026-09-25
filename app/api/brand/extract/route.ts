import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { ensureMonthlyCredits, getAiBalance, refundCredits, spendCredits } from "@/lib/ai/credits";
import { AI_COST_PER_BRAND_EXTRACTION } from "@/lib/plans";
import { isAiConfigured } from "@/lib/ai/client";
import { extractBrandProfile } from "@/lib/ai/brand";
import { emptySignals, signalsFromPdf, signalsFromText, signalsFromWebsite, addColors } from "@/lib/brand/extract";
import { presignedGetUrl } from "@/lib/r2";
import { getPlatformFlags } from "@/lib/platform";

const schema = z.object({
  name: z.string().max(80).optional(),
  websiteUrl: z.string().max(500).optional(),
  text: z.string().max(20000).optional(),
  /** Uploaded `brand_source` files (PDF/text) owned by this workspace. */
  sourceFileIds: z.array(z.string().uuid()).max(5).optional(),
  /** Dominant colours extracted from the logo in the browser. */
  logoColors: z.array(z.string().max(9)).max(12).optional(),
  manualColors: z.array(z.string().max(9)).max(12).optional(),
});

/**
 * Turn brand sources (website, guideline PDFs, pasted notes, logo colours)
 * into a reviewable BrandProfile. Deterministic extraction always runs; the
 * AI interpretation step costs credits only when it actually runs.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limit = checkRateLimit(`brand-extract:${userId}`, 8, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const input = body.data;
  if (!input.websiteUrl && !input.text && !input.sourceFileIds?.length && !input.logoColors?.length && !input.manualColors?.length) {
    return NextResponse.json({ error: "Add a website, a guidelines file, a logo, or some notes first." }, { status: 400 });
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  const admin = getServiceSupabase()!;
  const flags = await getPlatformFlags();

  const signals = emptySignals();
  if (input.name) signals.name = input.name;
  if (input.manualColors?.length) addColors(signals, input.manualColors, "chosen by you", 10);

  const work: Promise<void>[] = [];
  if (input.websiteUrl) work.push(signalsFromWebsite(input.websiteUrl, signals));
  if (input.text) signalsFromText(input.text, "your notes", signals);

  // Guideline documents: verify ownership, download from private storage, parse.
  if (input.sourceFileIds?.length) {
    const { data: files } = await admin
      .from("uploaded_files")
      .select("id, r2_key, mime_type, original_name, kind")
      .in("id", input.sourceFileIds)
      .eq("workspace_id", workspaceId)
      .eq("kind", "brand_source");
    for (const f of (files ?? []) as Array<{ id: string; r2_key: string; mime_type: string; original_name: string }>) {
      work.push(
        (async () => {
          const url = await presignedGetUrl(f.r2_key, 120);
          if (!url) return;
          const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
          if (!res?.ok) {
            signals.notes.push(`${f.original_name}: couldn't be downloaded.`);
            return;
          }
          if (f.mime_type === "application/pdf") {
            const buf = new Uint8Array(await res.arrayBuffer());
            await signalsFromPdf(buf, f.original_name, signals);
          } else if (f.mime_type.startsWith("text/")) {
            signalsFromText(await res.text(), f.original_name, signals);
          }
        })(),
      );
    }
  }
  await Promise.all(work);

  const useAi = flags.aiEnabled && isAiConfigured();
  let charged = 0;
  if (useAi) {
    const plan = await getWorkspacePlan(workspaceId);
    await ensureMonthlyCredits(workspaceId, plan);
    const balance = await getAiBalance(workspaceId);
    if (balance >= AI_COST_PER_BRAND_EXTRACTION) {
      const ok = await spendCredits(workspaceId, AI_COST_PER_BRAND_EXTRACTION, "brand_extract");
      if (ok) charged = AI_COST_PER_BRAND_EXTRACTION;
    }
  }

  const { profile, usedAi } = await extractBrandProfile({
    signals,
    name: input.name?.trim() || signals.name || "My brand",
    logoColors: input.logoColors,
    userText: input.text,
  });
  if (charged > 0 && !usedAi) {
    await refundCredits(workspaceId, charged, `brand-fail-${Date.now()}`);
    charged = 0;
  }

  return NextResponse.json({
    ok: true,
    profile,
    usedAi,
    creditsCharged: charged,
    balance: await getAiBalance(workspaceId),
    evidence: {
      colors: signals.colors.sort((a, b) => b.weight - a.weight).slice(0, 12),
      fonts: signals.fontNames,
      notes: signals.notes,
    },
  });
}
