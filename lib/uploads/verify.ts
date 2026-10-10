import { getServiceSupabase } from "@/lib/supabase/admin";
import { deleteR2Object, inspectAndFreezeUpload } from "@/lib/r2";
import type { Answers, FormSchemaV1 } from "@/types/forms";
import { isAzureBackend } from "@/lib/backend";
import { databaseResult } from "@/lib/db/result";
import { submissionFile } from "@/lib/db/repositories/respondents";
import { freezeFile, readUpload } from "@/lib/db/repositories/uploads";

export interface UploadRow {
  id: string;
  workspace_id: string;
  form_id: string | null;
  question_id: string | null;
  kind: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  verified_at: string | null;
  submission_id: string | null;
  upload_token_hash: string | null;
}

export async function finalizeUpload(row: UploadRow, access?: {userId?:string;tokenHash?:string}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (row.status !== "pending" && row.status !== "attached") return { ok: false, error: "This upload is unavailable." };
  if (row.verified_at) return { ok: true };
  let frozen: string | undefined;
  try {
    frozen = await inspectAndFreezeUpload(row.r2_key, row.size_bytes, row.mime_type);
    if (isAzureBackend()) {
      const changed = await freezeFile(access?.userId ?? null,row,frozen,access?.tokenHash ?? null);
      if (!changed) {
        await deleteR2Object(frozen);
        frozen=undefined;
        const winner=await readUpload(access?.userId ?? null,row.id,row.form_id,access?.tokenHash ?? null);
        if (!winner?.verified_at || winner.status==='deleted') throw new Error("Upload changed during verification.");
      }
      await deleteR2Object(row.r2_key).catch(() => {});
      return {ok:true};
    }
    const admin = getServiceSupabase()!;
    const { data, error } = await admin.from("uploaded_files")
      .update({ r2_key: frozen, verified_at: new Date().toISOString(), ...(row.kind !== "submission" ? { status: "attached" } : {}) })
      .eq("id", row.id).eq("status", row.status).eq("r2_key", row.r2_key).is("verified_at", null).select("id");
    if (error) throw new Error("Could not verify the upload.");
    if (!data?.length) {
      await deleteR2Object(frozen);
      const { data: winner } = await admin.from("uploaded_files").select("verified_at, status").eq("id", row.id).maybeSingle();
      if (!winner?.verified_at || winner.status === "deleted") throw new Error("Upload changed during verification.");
    }
    await deleteR2Object(row.r2_key).catch(() => {});
    return { ok: true };
  } catch {
    if (frozen) await deleteR2Object(frozen).catch(() => {});
    return { ok: false, error: "Couldn't verify this upload. Check its size and type, then upload it again." };
  }
}

export async function verifySubmissionFiles(form: { id: string; workspaceId: string }, schema: FormSchemaV1, answers: Answers) {
  const admin = getServiceSupabase()!;
  for (const [questionId, answer] of Object.entries(answers)) {
    if (answer.type !== "file_upload") continue;
    const block = schema.blocks.find((b) => b.id === questionId);
    if (!block || block.type !== "file_upload") return { ok: false, error: "Unknown upload question." };
    for (const fileId of answer.value) {
      const { data, error } = isAzureBackend() ? await databaseResult(submissionFile(form.id, form.workspaceId, questionId, fileId)) : await admin.from("uploaded_files").select("*").eq("id", fileId)
        .eq("form_id", form.id).eq("workspace_id", form.workspaceId).eq("question_id", questionId)
        .eq("kind", "submission").eq("status", "pending").is("submission_id", null).maybeSingle();
      const row = data as Pick<UploadRow, "verified_at" | "size_bytes" | "mime_type"> | null;
      if (error || !row || !row.verified_at || row.size_bytes > (block.maxSizeMb ?? 10) * 1024 * 1024 ||
          (block.allowedMimes?.length && !block.allowedMimes.includes(row.mime_type))) {
        return { ok: false, error: "An upload is missing, unverified, or belongs to another question. Please upload it again." };
      }
    }
  }
  return { ok: true };
}
