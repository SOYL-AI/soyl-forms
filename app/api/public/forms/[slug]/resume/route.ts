import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { isValidAnswer } from "@/lib/forms/answers";
import type { Block } from "@/types/forms";
import { clientIp, formAcceptance, resolvePublicForm } from "@/lib/forms/public";

const putSchema = z.object({
  sessionId: z.string().min(1).max(100),
  answers: z.record(z.unknown()),
  token: z.string().min(8).max(64).optional(),
});

/** Keep only answers that still validate (partial: required is not enforced yet). */
function scrub(blocks: Block[], answers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const b of blocks) {
    const raw = answers[b.id];
    if (raw === undefined || raw === null) continue;
    if (isValidAnswer(b, raw)) out[b.id] = raw;
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}

/**
 * Save progress for a resume link. Creates the token on first save and
 * reuses it afterwards; a token opened on another device takes over the row.
 */
export async function PUT(req: Request, { params }: { params: { slug: string } }) {
  const limit = checkRateLimit(`resume-put:${clientIp(req.headers)}:${params.slug}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = putSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  if (JSON.stringify(body.data.answers).length > 100_000) {
    return NextResponse.json({ error: "Progress is too large to save." }, { status: 413 });
  }

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const acceptance = formAcceptance(resolved.form);
  if (!acceptance.open) return NextResponse.json({ error: acceptance.message }, { status: 410 });

  const admin = getServiceSupabase();
  const kept = scrub(resolved.form.schema.blocks, body.data.answers);

  let token = body.data.token ?? null;
  if (token) {
    const { data: byToken } = await admin!
      .from("partial_responses")
      .select("id")
      .eq("form_id", resolved.form.id)
      .eq("token", token)
      .maybeSingle();
    if (!byToken) token = null;
  }
  if (!token) {
    const { data: bySession } = await admin!
      .from("partial_responses")
      .select("token")
      .eq("form_id", resolved.form.id)
      .eq("session_id", body.data.sessionId)
      .maybeSingle();
    token = (bySession as { token: string } | null)?.token ?? randomUUID().replace(/-/g, "");
  }

  const { error } = await admin!
    .from("partial_responses")
    .upsert(
      {
        form_id: resolved.form.id,
        form_version_id: resolved.form.versionId,
        session_id: body.data.sessionId,
        token,
        answers: kept,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "form_id,session_id" },
    );
  if (error) return NextResponse.json({ error: "Couldn't save progress." }, { status: 500 });
  return NextResponse.json({ ok: true, token });
}

/** Load saved progress for a resume link. */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const limit = checkRateLimit(`resume-get:${clientIp(req.headers)}:${params.slug}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(token)) return NextResponse.json({ error: "Invalid link." }, { status: 400 });

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const admin = getServiceSupabase();
  const { data: row } = await admin!
    .from("partial_responses")
    .select("answers, updated_at")
    .eq("form_id", resolved.form.id)
    .eq("token", token)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "This resume link is invalid or expired." }, { status: 404 });
  const r = row as { answers: Record<string, unknown>; updated_at: string };
  return NextResponse.json({
    ok: true,
    answers: scrub(resolved.form.schema.blocks, r.answers ?? {}),
    savedAt: r.updated_at,
  });
}

/** Invalidate saved progress (called after a successful submit). */
export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const body = z.object({ sessionId: z.string().min(1).max(100) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const admin = getServiceSupabase();
  await admin!
    .from("partial_responses")
    .delete()
    .eq("form_id", resolved.form.id)
    .eq("session_id", body.data.sessionId);
  return NextResponse.json({ ok: true });
}
