import { getServiceSupabase } from "@/lib/supabase/admin";
import { resolveFormVersion } from "./public";
import { isValidAnswer } from "./answers";
import type { Answers } from "@/types/forms";
import { isAzureBackend } from "@/lib/backend";
import { databaseResult } from "@/lib/db/result";
import { loadProgress } from "@/lib/db/repositories/respondents";

export interface ResumeState {
  answers: Answers;
  currentId?: string;
  history: string[];
  sessionId: string;
  idempotencyKey: string;
  token: string;
}

export async function loadResume(formId: string, token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const admin = getServiceSupabase();
  if (!isAzureBackend() && !admin) return null;
  const { data, error } = isAzureBackend() ? await databaseResult(loadProgress(formId, token)) : await admin!.from("partial_responses")
    .select("answers, current_block_id, history, session_id, idempotency_key, form_version_id, updated_at")
    .eq("form_id", formId).eq("token", token)
    .gt("updated_at", new Date(Date.now() - 30 * 86400_000).toISOString()).maybeSingle();
  if (error || !data?.form_version_id) return null;
  const version = await resolveFormVersion(formId, data.form_version_id);
  if (!version) return null;
  const { data: submitted, error: submittedError } = !isAzureBackend() && data.idempotency_key ? await admin!.from("submissions").select("id")
    .eq("form_id", formId).eq("idempotency_key", data.idempotency_key).maybeSingle() : { data: null, error: null };
  if (submittedError || submitted) return null;
  const answers: Answers = {};
  for (const block of version.schema.blocks) {
    const answer = data.answers?.[block.id];
    if (isValidAnswer(block, answer)) answers[block.id] = answer;
  }
  const ids = new Set(version.schema.blocks.map((b) => b.id));
  return {
    version, savedAt: data.updated_at as string,
    state: {
      answers, currentId: ids.has(data.current_block_id) ? data.current_block_id : undefined,
      history: (data.history ?? []).filter((id: string) => ids.has(id)),
      sessionId: data.session_id,
      idempotencyKey: data.idempotency_key ?? crypto.randomUUID(), token,
    } as ResumeState,
  };
}
