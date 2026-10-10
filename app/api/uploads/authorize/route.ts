import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { isR2Configured, newR2Key, presignedPutUrl } from "@/lib/r2";
import { PLANS } from "@/lib/plans";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { getPlatformFlags } from "@/lib/platform";
import { hasWorkspaceRole } from "@/lib/security/workspace";
import { isAzureBackend } from "@/lib/backend";
import { reserveFile } from "@/lib/db/repositories/uploads";
import { readForm } from "@/lib/db/repositories/forms";
import { readBrand } from "@/lib/db/repositories/brands";
import { databaseResult } from "@/lib/db/result";

/** Image types a creator may publish on their forms (served publicly). */
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Brand source documents (never served publicly; read by the extractor). */
const DOC_MIMES = ["application/pdf", "text/plain", "text/markdown"];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOC_BYTES = 25 * 1024 * 1024;

const schema = z.object({
  kind: z.enum(["brand_asset", "question_media", "brand_source"]),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(100 * 1024 * 1024),
  formId: z.string().uuid().optional(),
  brandKitId: z.string().uuid().optional(),
});

/**
 * Owner-authorized upload for creator assets: logos, question images, and
 * brand guideline documents. Verifies workspace membership, plan storage
 * quota, MIME/size policy, then issues a short-lived presigned PUT.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limit = await enforceRateLimit(`owner-upload:${userId}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many uploads. Wait a moment." }, { status: 429 });

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Uploads are temporarily unavailable. You can paste an image URL instead." },
      { status: 503 },
    );
  }
  const flags = await getPlatformFlags();
  if (!flags.uploadsEnabled) {
    return NextResponse.json({ error: "Uploads are paused right now." }, { status: 503 });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  const input = body.data;

  const isDoc = input.kind === "brand_source";
  const allowed = isDoc ? [...DOC_MIMES, ...IMAGE_MIMES] : IMAGE_MIMES;
  if (!allowed.includes(input.mimeType)) {
    return NextResponse.json(
      { error: isDoc ? "Upload a PDF, text file, or image." : "Upload a PNG, JPG, WebP, or GIF." },
      { status: 400 },
    );
  }
  const maxBytes = isDoc ? MAX_DOC_BYTES : MAX_IMAGE_BYTES;
  if (input.sizeBytes > maxBytes) {
    return NextResponse.json(
      { error: `Keep files under ${Math.round(maxBytes / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  if (!(await hasWorkspaceRole(workspaceId, "editor"))) return NextResponse.json({ error: "Editing permission is required." }, { status: 403 });
  const admin = getServiceSupabase();

  if (input.formId) {
    const { data: form } = isAzureBackend() ? await databaseResult(readForm(userId,input.formId)) : await admin!
      .from("forms")
      .select("id, workspace_id")
      .eq("id", input.formId)
      .maybeSingle();
    if ((form as { workspace_id: string } | null)?.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }
  }
  if (input.brandKitId) {
    const { data: kit } = isAzureBackend() ? await databaseResult(readBrand(userId,workspaceId,input.brandKitId)) : await admin!
      .from("brand_kits")
      .select("id, workspace_id")
      .eq("id", input.brandKitId)
      .maybeSingle();
    if ((kit as { workspace_id: string } | null)?.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Brand kit not found." }, { status: 404 });
    }
  }

  const plan = await getWorkspacePlan(workspaceId);
  const fileId = crypto.randomUUID();
  const key = newR2Key(workspaceId, input.formId ?? `brand-${input.brandKitId ?? "kit"}`, fileId);
  const uploadUrl = await presignedPutUrl(key, input.mimeType, input.sizeBytes);
  if (!uploadUrl) return NextResponse.json({ error: "Upload service unavailable." }, { status: 503 });

  const safeName = input.fileName.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
  const file = {
    id: fileId,
    workspace_id: workspaceId,
    form_id: input.formId ?? null,
    brand_kit_id: input.brandKitId ?? null,
    question_id: null,
    r2_key: key,
    original_name: safeName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    status: "pending",
    kind: input.kind,
  };
  const storageLimit=PLANS[plan].entitlements.storageBytes;
  const {data:reserved,error}=isAzureBackend() ? await databaseResult(reserveFile(userId,file,storageLimit)) :
    await admin!.rpc("reserve_upload",{p_storage_limit:storageLimit,p_file:file});
  if (error || !reserved) return NextResponse.json({ error: "Could not start upload." }, { status: 500 });

  return NextResponse.json({
    fileId,
    uploadUrl,
    publicUrl: isDoc ? null : `/api/public/assets/${fileId}`,
  });
}
