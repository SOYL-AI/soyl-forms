import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { validateAnswers } from "@/lib/forms/answers";
import { PLANS } from "@/lib/plans";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { clientIp, formAcceptance, resolvePublicForm } from "@/lib/forms/public";

const submitSchema = z.object({
  formVersionId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1).max(100),
  answers: z.record(z.unknown()),
  hiddenFields: z.record(z.unknown()).optional().default({}),
  sessionId: z.string().min(1).max(100).optional(),
  source: z.string().max(20).optional(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const ip = clientIp(req.headers);
  const limit = checkRateLimit(`submit:${ip}:${params.slug}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const body = submitSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }
  const input = body.data;

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const form = resolved.form;
  const admin = getServiceSupabase();

  // Form must be live and the payload must target the current version.
  const acceptance = formAcceptance(form);
  if (!acceptance.open) {
    return NextResponse.json({ error: acceptance.message }, { status: 410 });
  }
  if (input.formVersionId !== form.versionId) {
    return NextResponse.json(
      { error: "This form was updated. Please reload it and answer again." },
      { status: 409 },
    );
  }

  // Per-form response cap (best-effort count; the monthly plan gate is atomic).
  if (form.settings.submissionLimit) {
    const { count } = await admin!
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .is("deleted_at", null);
    if ((count ?? 0) >= form.settings.submissionLimit) {
      return NextResponse.json(
        { error: form.settings.closedMessage ?? "This form is no longer accepting responses." },
        { status: 410 },
      );
    }
  }

  // Answers validated against the exact published version.
  const checked = validateAnswers(form.schema, input.answers);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  // Hidden fields: small, plain, and only when the form collects them.
  let hidden: Record<string, string> = {};
  if (form.settings.collectQueryParams !== false) {
    const entries = Object.entries(input.hiddenFields).slice(0, 20);
    for (const [k, v] of entries) {
      if (/^[A-Za-z0-9_.-]{1,64}$/.test(k) && typeof v === "string" && v.length <= 200) {
        hidden[k] = v;
      }
    }
  }

  // Effective workspace plan → atomic insert + monthly gate in one transaction.
  const plan = await getWorkspacePlan(form.workspaceId);
  const source = input.source && /^[a-z0-9_-]{1,20}$/i.test(input.source) ? input.source.toLowerCase() : null;

  const { data: result, error: rpcError } = await admin!.rpc("submit_form", {
    p_form_id: form.id,
    p_workspace_id: form.workspaceId,
    p_version_id: form.versionId,
    p_idempotency_key: input.idempotencyKey,
    p_answers: checked.value,
    p_hidden: hidden,
    p_source: source,
    p_duration_ms: input.durationMs ?? null,
    p_monthly_limit: PLANS[plan].entitlements.monthlySubmissions,
  });
  if (rpcError) {
    return NextResponse.json({ error: "Couldn't save your response. Try again." }, { status: 500 });
  }
  const out = result as { ok: boolean; duplicate?: boolean; submission_id?: string; error?: string };
  if (!out.ok) {
    if (out.error === "LIMIT_REACHED") {
      return NextResponse.json(
        { error: form.settings.closedMessage ?? "This form has stopped accepting responses." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Couldn't save your response. Try again." }, { status: 500 });
  }

  // Attach uploaded files to this submission (ids were issued by the
  // authorize endpoint for this form; anything else is ignored).
  const fileIds = Object.values(checked.value)
    .filter((a) => a.type === "file_upload")
    .flatMap((a) => (a.type === "file_upload" ? a.value : []))
    .slice(0, 50);
  if (fileIds.length > 0 && out.submission_id) {
    await admin!
      .from("uploaded_files")
      .update({ submission_id: out.submission_id, status: "attached" })
      .eq("form_id", form.id)
      .eq("status", "pending")
      .in("id", fileIds);
  }

  // Best-effort visit completion (analytics must never fail a submission).
  if (input.sessionId) {
    await admin!
      .from("form_visits")
      .update({ completed_at: new Date().toISOString(), duration_ms: input.durationMs ?? null })
      .eq("form_id", form.id)
      .eq("session_id", input.sessionId)
      .is("completed_at", null);
  }

  return NextResponse.json({
    ok: true,
    submissionId: out.submission_id,
    duplicate: out.duplicate ?? false,
  });
}
