import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { clientIp, resolvePublicForm, resolveFormVersion } from "@/lib/forms/public";

const progressSchema = z.object({
  sessionId: z.string().min(1).max(100),
  formVersionId: z.string().uuid(),
  blockId: z.string().min(1).max(64),
});

/**
 * Drop-off ping: records the furthest question a session reached.
 * Best-effort analytics — never fails loudly, never touches answers.
 */
export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const limit = await enforceRateLimit(`progress:${clientIp(req.headers)}:${params.slug}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = progressSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const admin = getServiceSupabase();
  const version = await resolveFormVersion(resolved.form.id, body.data.formVersionId);
  if (!version || !version.schema.blocks.some((b) => b.id === body.data.blockId)) return NextResponse.json({ error: "Unknown question." }, { status: 400 });
  await admin!.rpc("record_form_progress", { p_form_id: resolved.form.id, p_session_id: body.data.sessionId, p_block_id: body.data.blockId });

  return NextResponse.json({ ok: true });
}
