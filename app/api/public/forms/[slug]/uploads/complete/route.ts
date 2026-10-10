import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { clientIp, formAcceptance, resolvePublicForm } from "@/lib/forms/public";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { finalizeUpload, type UploadRow } from "@/lib/uploads/verify";
import { isAzureBackend } from "@/lib/backend";
import { readUpload } from "@/lib/db/repositories/uploads";
import { databaseResult } from "@/lib/db/result";

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const limit = await enforceRateLimit(`upload-complete:${clientIp(req.headers)}:${slug}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const parsed = z.object({ fileId: z.string().uuid(), uploadToken: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const resolved = await resolvePublicForm(slug);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!formAcceptance(resolved.form).open) return NextResponse.json({ error: "This form is closed." }, { status: 410 });
  const hash = createHash("sha256").update(parsed.data.uploadToken).digest();
  const { data } = isAzureBackend() ? await databaseResult(readUpload(null,parsed.data.fileId,resolved.form.id,hash.toString("hex"))) : await getServiceSupabase()!.from("uploaded_files").select("*")
    .eq("id", parsed.data.fileId).eq("form_id", resolved.form.id).eq("kind", "submission").maybeSingle();
  const row = data as UploadRow | null;
  if (!row?.upload_token_hash || !/^[a-f0-9]{64}$/.test(row.upload_token_hash) || !timingSafeEqual(hash, Buffer.from(row.upload_token_hash, "hex"))) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  const result = await finalizeUpload(row,{tokenHash:hash.toString("hex")});
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
