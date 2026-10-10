import { getDatabasePool } from "@/lib/db/pool";
import type { Answers } from "@/types/forms";

export interface SubmissionReceipt { id: string; form_version_id: string; answers: Answers }
export interface SubmissionOutcome { ok: boolean; duplicate?: boolean; submission_id?: string; error?: string }
export interface ProgressRow { answers: Answers; current_block_id: string; history: string[]; session_id: string; idempotency_key: string | null; form_version_id: string; updated_at: string }
export interface ProgressIdentity { token: string; sessionId: string; idempotencyKey: string }
export interface FileMetadata { id: string; mime_type: string; size_bytes: number; verified_at: string }
export async function readReceipt(formId: string, key: string): Promise<SubmissionReceipt | null> {
  return (await getDatabasePool().query<{ receipt: SubmissionReceipt | null }>("select platform.public_submission_receipt($1,$2) as receipt", [formId, key])).rows[0]?.receipt ?? null;
}
export async function responseCount(formId: string): Promise<number> {
  return Number((await getDatabasePool().query<{ count: string }>("select platform.public_response_count($1) as count", [formId])).rows[0]?.count ?? 0);
}
export async function submitResponse(input: { formId: string; workspaceId: string; versionId: string; key: string; answers: Answers; hidden: Record<string, string>; source: string | null; durationMs: number | null; monthlyLimit: number; sessionId?: string; resumeToken?: string }): Promise<SubmissionOutcome> {
  const result = await getDatabasePool().query<{ result: SubmissionOutcome }>("select platform.submit_response($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result",
    [input.formId, input.workspaceId, input.versionId, input.key, JSON.stringify(input.answers), JSON.stringify(input.hidden), input.source,
      input.durationMs, input.monthlyLimit, input.sessionId ?? null, input.resumeToken ?? null]);
  return result.rows[0].result;
}
export async function startVisit(formId: string, versionId: string, session: string, source: string | null): Promise<void> {
  await getDatabasePool().query("select platform.start_visit($1,$2,$3,$4)", [formId, versionId, session, source]);
}
export async function recordProgress(formId: string, versionId: string, session: string, block: string): Promise<void> {
  await getDatabasePool().query("select platform.record_progress($1,$2,$3,$4)", [formId, versionId, session, block]);
}
export async function saveProgress(input: { formId: string; versionId: string; session: string; token?: string; answers: Record<string, unknown>; key: string; current: string | null; history: string[] }): Promise<ProgressIdentity | null> {
  return (await getDatabasePool().query<{ saved: ProgressIdentity | null }>("select platform.save_progress($1,$2,$3,$4,$5,$6,$7,$8) as saved",
    [input.formId, input.versionId, input.session, input.token ?? null, JSON.stringify(input.answers), input.key, input.current, input.history])).rows[0]?.saved ?? null;
}
export async function loadProgress(formId: string, token: string): Promise<ProgressRow | null> {
  return (await getDatabasePool().query<{ saved: ProgressRow | null }>("select platform.load_progress($1,$2) as saved", [formId, token])).rows[0]?.saved ?? null;
}
export async function submissionFile(formId: string, workspaceId: string, question: string, fileId: string): Promise<FileMetadata | null> {
  return (await getDatabasePool().query<{ file: FileMetadata | null }>("select platform.submission_file_metadata($1,$2,$3,$4) as file", [formId, workspaceId, question, fileId])).rows[0]?.file ?? null;
}
