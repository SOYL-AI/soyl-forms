import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { clientIp, resolvePublicForm } from "@/lib/forms/public";

const progressSchema = z.object({
  sessionId: z.string().min(1).max(100),
  blockId: z.string().min(1).max(64),
});

/**
 * Drop-off ping: records the furthest question a session reached.
 * Best-effort analytics — never fails loudly, never touches answers.
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const limit = checkRateLimit(`progress:${clientIp(req.headers)}:${params.slug}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = progressSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const admin = getServiceSupabase();
  await admin!
    .from("form_visits")
    .update({ last_block_id: body.data.blockId, progress_at: new Date().toISOString() })
    .eq("form_id", resolved.form.id)
    .eq("session_id", body.data.sessionId)
    .is("completed_at", null);

  return NextResponse.json({ ok: true });
}
