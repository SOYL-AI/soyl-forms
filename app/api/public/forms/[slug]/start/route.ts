import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { clientIp, resolvePublicForm, resolveFormVersion } from "@/lib/forms/public";
import { isAzureBackend } from "@/lib/backend";
import { startVisit } from "@/lib/db/repositories/respondents";

const startSchema = z.object({
  sessionId: z.string().min(1).max(100),
  formVersionId: z.string().uuid().optional(),
  source: z.string().max(500).optional(),
});

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const limit = await enforceRateLimit(`start:${clientIp(req.headers)}:${params.slug}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = startSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  }

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const admin = getServiceSupabase();
  const version = body.data.formVersionId ? await resolveFormVersion(resolved.form.id, body.data.formVersionId) : null;
  if (body.data.formVersionId && !version) return NextResponse.json({ error: "Invalid version." }, { status: 400 });
  if (isAzureBackend()) await startVisit(resolved.form.id, version?.versionId ?? resolved.form.versionId, body.data.sessionId,
    body.data.source?.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || null);
  else await admin!.from("form_visits").upsert({
    form_id: resolved.form.id,
    form_version_id: version?.versionId ?? resolved.form.versionId,
    session_id: body.data.sessionId,
    source: body.data.source?.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || null,
  }, { onConflict: "form_id,session_id", ignoreDuplicates: true });

  return NextResponse.json({ ok: true });
}
