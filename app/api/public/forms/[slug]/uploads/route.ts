import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { clientIp, formAcceptance, resolvePublicForm } from "@/lib/forms/public";
import { isR2Configured, newR2Key, presignedPutUrl } from "@/lib/r2";
import { canUploadFile, PLANS, type PlanCode } from "@/lib/plans";

const DEFAULT_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
];

const authorizeSchema = z.object({
  questionId: z.string().min(1).max(64),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(100 * 1024 * 1024),
});

export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const limit = checkRateLimit(`upload:${clientIp(req.headers)}:${params.slug}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many uploads. Wait a moment." }, { status: 429 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "File uploads aren't connected on this form yet." },
      { status: 503 },
    );
  }

  const body = authorizeSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const form = resolved.form;
  const acceptance = formAcceptance(form);
  if (!acceptance.open) {
    return NextResponse.json({ error: acceptance.message }, { status: 410 });
  }

  const block = form.schema.blocks.find((b) => b.id === body.data.questionId);
  if (!block || block.type !== "file_upload") {
    return NextResponse.json({ error: "Unknown file question." }, { status: 400 });
  }

  const maxBytes = Math.min(block.maxSizeMb ?? 10, 100) * 1024 * 1024;
  if (body.data.sizeBytes > maxBytes) {
    return NextResponse.json(
      { error: `File must be under ${Math.round(maxBytes / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }
  const allowed = block.allowedMimes?.length ? block.allowedMimes : DEFAULT_MIMES;
  if (!allowed.includes(body.data.mimeType)) {
    return NextResponse.json({ error: "This file type isn't accepted here." }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { data: sub } = await admin!
    .from("subscriptions")
    .select("plan_code")
    .eq("workspace_id", form.workspaceId)
    .maybeSingle();
  const code = (sub as { plan_code: string } | null)?.plan_code;
  const plan: PlanCode = code === "starter" || code === "pro" ? code : "free";

  const { data: files } = await admin!
    .from("uploaded_files")
    .select("size_bytes")
    .eq("workspace_id", form.workspaceId)
    .neq("status", "deleted");
  const used = ((files ?? []) as Array<{ size_bytes: number }>).reduce(
    (s, f) => s + f.size_bytes,
    0,
  );
  const quota = canUploadFile({ plan, storageUsedBytes: used, fileBytes: body.data.sizeBytes });
  if (!quota.ok) {
    return NextResponse.json({ error: quota.reason }, { status: 403 });
  }

  // Server-chosen random key: clients never pick storage paths, and no
  // respondent data (names/emails) goes into the key.
  const fileId = crypto.randomUUID();
  const key = newR2Key(form.workspaceId, form.id, fileId);
  const uploadUrl = await presignedPutUrl(key, body.data.mimeType);
  if (!uploadUrl) {
    return NextResponse.json({ error: "Upload service unavailable." }, { status: 503 });
  }

  const safeName = body.data.fileName.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
  const { error } = await admin!.from("uploaded_files").insert({
    id: fileId,
    workspace_id: form.workspaceId,
    form_id: form.id,
    question_id: block.id,
    r2_key: key,
    original_name: safeName,
    mime_type: body.data.mimeType,
    size_bytes: body.data.sizeBytes,
    status: "pending",
  });
  if (error) {
    return NextResponse.json({ error: "Could not start upload." }, { status: 500 });
  }
  return NextResponse.json({ fileId, uploadUrl });
}
