import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { clientIp, resolvePublicForm } from "@/lib/forms/public";

const startSchema = z.object({
  sessionId: z.string().min(1).max(100),
  source: z.string().max(20).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const limit = checkRateLimit(`start:${clientIp(req.headers)}:${params.slug}`, 60, 60_000);
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
  await admin!.from("form_visits").insert({
    form_id: resolved.form.id,
    form_version_id: resolved.form.versionId,
    session_id: body.data.sessionId,
    source: body.data.source ?? null,
  });

  return NextResponse.json({ ok: true });
}
