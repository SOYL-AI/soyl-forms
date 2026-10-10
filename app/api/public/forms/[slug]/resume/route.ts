import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { isValidAnswer } from "@/lib/forms/answers";
import { clientIp, formAcceptance, resolveFormVersion, resolvePublicForm } from "@/lib/forms/public";
import { loadResume } from "@/lib/forms/resume";
import { publicSchema } from "@/lib/forms/quiz";
import { isAzureBackend } from "@/lib/backend";
import { databaseResult } from "@/lib/db/result";
import { saveProgress } from "@/lib/db/repositories/respondents";

const putSchema = z.object({
  sessionId: z.string().min(16).max(100), idempotencyKey: z.string().min(16).max(100),
  formVersionId: z.string().uuid(), currentId: z.string().max(64).optional(),
  history: z.array(z.string().max(64)).max(200).default([]),
  answers: z.record(z.unknown()), token: z.string().regex(/^[a-f0-9]{32}$/).optional(),
});

export async function PUT(req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!(await enforceRateLimit(`resume-put:${clientIp(req.headers)}:${slug}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const body = putSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  if (JSON.stringify(body.data.answers).length > 100_000) return NextResponse.json({ error: "Progress is too large." }, { status: 413 });
  const resolved = await resolvePublicForm(slug);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!formAcceptance(resolved.form).open) return NextResponse.json({ error: "This form is closed." }, { status: 410 });
  const version = await resolveFormVersion(resolved.form.id, body.data.formVersionId);
  if (!version) return NextResponse.json({ error: "This form version is unavailable." }, { status: 409 });
  const answers: Record<string, unknown> = {};
  for (const block of version.schema.blocks) {
    const answer = body.data.answers[block.id];
    if (isValidAnswer(block, answer)) answers[block.id] = answer;
  }
  const ids = new Set(version.schema.blocks.map((b) => b.id));
  const { data, error } = isAzureBackend() ? await databaseResult(saveProgress({
    formId: resolved.form.id, versionId: version.versionId, session: body.data.sessionId, key: body.data.idempotencyKey,
    token: body.data.token, answers, current: ids.has(body.data.currentId ?? "") ? body.data.currentId! : null,
    history: body.data.history.filter(id => ids.has(id)),
  })) : await getServiceSupabase()!.rpc("save_partial_response", {
    p_form_id: resolved.form.id, p_version_id: version.versionId,
    p_session_id: body.data.sessionId, p_idempotency_key: body.data.idempotencyKey,
    p_token: body.data.token ?? null, p_answers: answers,
    p_current_block_id: ids.has(body.data.currentId ?? "") ? body.data.currentId : null,
    p_history: body.data.history.filter((id) => ids.has(id)),
  });
  if (error || !data) return NextResponse.json({ error: "This progress link expired or the response was already submitted." }, { status: 409 });
  return NextResponse.json({ ok: true, ...data });
}

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!(await enforceRateLimit(`resume-get:${clientIp(req.headers)}:${slug}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const resolved = await resolvePublicForm(slug);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!formAcceptance(resolved.form).open) return NextResponse.json({ error: "This form is closed." }, { status: 410 });
  const saved = await loadResume(resolved.form.id, new URL(req.url).searchParams.get("token") ?? "");
  if (!saved) return NextResponse.json({ error: "This resume link is invalid or expired." }, { status: 404 });
  return NextResponse.json({ ok: true, ...saved.state, savedAt: saved.savedAt,
    versionId: saved.version.versionId, schema: publicSchema(saved.version.schema),
    settings: saved.version.settings, theme: saved.version.theme,
  }, { headers: { "cache-control": "no-store" } });
}

// Resume invalidation happens inside submit_form_safe; no public session-only DELETE.
