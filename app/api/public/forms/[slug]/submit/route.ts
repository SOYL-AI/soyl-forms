import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { validateAnswers } from "@/lib/forms/answers";
import { scoreAnswers } from "@/lib/forms/quiz";
import { PLANS } from "@/lib/plans";
import { getPublicFormPlan } from "@/lib/billing/plan";
import { clientIp, formAcceptance, resolveFormVersion, resolvePublicForm } from "@/lib/forms/public";
import { expectedPaiseForBlock } from "@/lib/billing/payments-server";
import { verifySubmissionFiles } from "@/lib/uploads/verify";
import { isAzureBackend } from "@/lib/backend";
import { databaseResult } from "@/lib/db/result";
import { readReceipt, submitResponse } from "@/lib/db/repositories/respondents";

const submitSchema = z.object({
  formVersionId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(16).max(100),
  answers: z.record(z.unknown()),
  hiddenFields: z.record(z.unknown()).optional().default({}),
  sessionId: z.string().min(16).max(100).optional(),
  resumeToken: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  // Lenient on metadata: a long ?src= tag or a tab left open for days must
  // never cost a response. Both are cleaned up below instead of rejected.
  source: z.string().max(500).optional(),
  durationMs: z.number().min(0).optional(),
});

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const ip = clientIp(req.headers);
  const limit = await enforceRateLimit(`submit:${ip}:${params.slug}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const body = submitSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Something went wrong sending your answers. Please try again." }, { status: 400 });
  }
  const input = body.data;

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const form = resolved.form;
  const admin = getServiceSupabase();
  // Acknowledgement may have been lost, including after the form closed.
  const { data: existing, error: existingError } = isAzureBackend() ? await databaseResult(readReceipt(form.id, input.idempotencyKey)) : await admin!
    .from("submissions").select("id, form_version_id, answers").eq("form_id", form.id)
    .eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existingError) return NextResponse.json({ error: "Please try again. Your answers are kept." }, { status: 503 });
  if (existing) {
    const original = await resolveFormVersion(form.id, existing.form_version_id);
    const score = original?.settings.quizMode && original.settings.showScore !== false
      ? scoreAnswers(original.schema, existing.answers) : undefined;
    return NextResponse.json({ ok: true, duplicate: true, submissionId: existing.id,
      ...(score && score.max > 0 ? { score: { points: score.points, max: score.max } } : {}) });
  }

  // Form must be live.
  const acceptance = formAcceptance(form);
  if (!acceptance.open) {
    return NextResponse.json({ error: acceptance.message }, { status: 410 });
  }

  // Validate against the version the respondent actually answered. If the
  // owner re-published while they were filling it in, their answers still
  // count — they're stored against the older version.
  let answered = { versionId: form.versionId, schema: form.schema, settings: form.settings };
  if (input.formVersionId !== form.versionId) {
    const older = await resolveFormVersion(form.id, input.formVersionId);
    if (!older) {
      return NextResponse.json(
        { error: "This form has changed since you opened it. Please refresh the page to see the latest version." },
        { status: 409 },
      );
    }
    answered = older;
  }

  // Answers validated against the exact published version.
  const checked = validateAnswers(answered.schema, input.answers);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  // Recompute charges here; the transaction validates and links all paid rows.
  const paymentAnswers = Object.entries(checked.value).filter((entry): entry is [string, Extract<(typeof checked.value)[string], { type: "payment" }>] => entry[1].type === "payment");
  for (const [blockId, a] of paymentAnswers) {
    const block = answered.schema.blocks.find((b) => b.id === blockId);
    if (!block || block.type !== "payment") {
      return NextResponse.json({ error: "Unknown payment step." }, { status: 400 });
    }
    const expected = expectedPaiseForBlock(answered.schema.blocks, block, checked.value);
    if (expected === null || a.value.amount_paise !== expected) {
      return NextResponse.json({ error: "The paid amount does not match this form. Please pay again." }, { status: 402 });
    }

  }

  const files = await verifySubmissionFiles(form, answered.schema, checked.value);
  if (!files.ok) return NextResponse.json({ error: files.error }, { status: 400 });

  // Hidden fields: small, plain, and only when the form collects them.
  let hidden: Record<string, string> = {};
  if (answered.settings.collectQueryParams !== false) {
    const entries = Object.entries(input.hiddenFields).slice(0, 20);
    for (const [k, v] of entries) {
      if (/^[A-Za-z0-9_.-]{1,64}$/.test(k) && typeof v === "string" && v.length <= 200) {
        hidden[k] = v;
      }
    }
  }

  // Time-to-complete is analytics only; anything over a day is capped.
  const durationMs = input.durationMs === undefined ? null : Math.min(Math.round(input.durationMs), 24 * 3600 * 1000);

  // Effective workspace plan → atomic insert + monthly gate in one transaction.
  const plan = await getPublicFormPlan(form);
  const source = input.source?.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || null;

  const { data: result, error: rpcError } = isAzureBackend() ? await databaseResult(submitResponse({
    formId: form.id, workspaceId: form.workspaceId, versionId: answered.versionId, key: input.idempotencyKey,
    answers: checked.value, hidden, source, durationMs, monthlyLimit: PLANS[plan].entitlements.monthlySubmissions,
    sessionId: input.sessionId, resumeToken: input.resumeToken,
  })) : await admin!.rpc("submit_form_safe", {
    p_form_id: form.id,
    p_workspace_id: form.workspaceId,
    p_version_id: answered.versionId,
    p_idempotency_key: input.idempotencyKey,
    p_answers: checked.value,
    p_hidden: hidden,
    p_source: source,
    p_duration_ms: durationMs,
    p_monthly_limit: PLANS[plan].entitlements.monthlySubmissions,
    p_session_id: input.sessionId ?? null,
    p_resume_token: input.resumeToken ?? null,
  });
  if (rpcError) {
    return NextResponse.json({ error: "We couldn't save your response. Please try again — your answers are kept." }, { status: 500 });
  }
  const out = result as { ok: boolean; duplicate?: boolean; submission_id?: string; error?: string };
  if (!out.ok) {
    if (out.error === "PAYMENT_MISMATCH") return NextResponse.json({ error: "This payment was already used or doesn't match this question. Your answers are kept." }, { status: 409 });
    if (out.error === "FILE_MISMATCH") return NextResponse.json({ error: "An upload is missing or unavailable. Please upload it again." }, { status: 400 });
    if (["LIMIT_REACHED", "FORM_LIMIT_REACHED", "CLOSED"].includes(out.error ?? "")) {
      return NextResponse.json(
        { error: form.settings.closedMessage ?? "This form has stopped accepting responses." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "We couldn't save your response. Please try again — your answers are kept." }, { status: 500 });
  }

  // Quiz mode: grade against the stored answer key (never sent to the browser).
  let score: { points: number; max: number } | undefined;
  if (answered.settings.quizMode && answered.settings.showScore !== false) {
    const graded = scoreAnswers(answered.schema, checked.value);
    if (graded.max > 0) score = { points: graded.points, max: graded.max };
  }

  return NextResponse.json({
    ok: true,
    submissionId: out.submission_id,
    duplicate: out.duplicate ?? false,
    ...(score ? { score } : {}),
  });
}
