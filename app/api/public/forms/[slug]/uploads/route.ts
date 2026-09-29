import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { clientIp, formAcceptance, resolvePublicForm } from "@/lib/forms/public";
import { isR2Configured, newR2Key, presignedPutUrl } from "@/lib/r2";
import { canUploadFile } from "@/lib/plans";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { getPlatformFlags } from "@/lib/platform";

const DEFAULT_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/**
 * Browsers often misreport types: HEIC photos and extension-less files arrive
 * as "" or application/octet-stream, and Windows labels .csv as an Excel file.
 * When the reported type isn't accepted, fall back to the file extension.
 */
const EXTENSION_MIMES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function acceptedMime(reported: string, fileName: string, allowed: string[]): string | null {
  if (allowed.includes(reported)) return reported;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const inferred = EXTENSION_MIMES[ext];
  return inferred && allowed.includes(inferred) ? inferred : null;
}

const authorizeSchema = z.object({
  questionId: z.string().min(1).max(64),
  fileName: z.string().min(1).max(1000),
  mimeType: z.string().max(200),
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
      { error: "Uploads are temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
  const flags = await getPlatformFlags();
  if (!flags.uploadsEnabled) {
    return NextResponse.json({ error: "Uploads are paused right now." }, { status: 503 });
  }

  const body = authorizeSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "We couldn't start this upload. Please try again." }, { status: 400 });
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
  const mimeType = acceptedMime(body.data.mimeType, body.data.fileName, allowed);
  if (!mimeType) {
    return NextResponse.json({ error: "This file type isn't accepted here." }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const plan = await getWorkspacePlan(form.workspaceId);

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
  const uploadUrl = await presignedPutUrl(key, mimeType);
  if (!uploadUrl) {
    return NextResponse.json({ error: "Uploads are temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const safeName = body.data.fileName.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
  const { error } = await admin!.from("uploaded_files").insert({
    id: fileId,
    workspace_id: form.workspaceId,
    form_id: form.id,
    kind: "submission",
    question_id: block.id,
    r2_key: key,
    original_name: safeName,
    mime_type: mimeType,
    size_bytes: body.data.sizeBytes,
    status: "pending",
  });
  if (error) {
    return NextResponse.json({ error: "We couldn't start this upload. Please try again." }, { status: 500 });
  }
  // The URL is signed for this exact content type; the browser must send it.
  return NextResponse.json({ fileId, uploadUrl, contentType: mimeType });
}
