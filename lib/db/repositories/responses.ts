import { withUserTransaction } from "@/lib/db/pool";
import type { Answers } from "@/types/forms";
import { applyEditedAnswer, normalizeTags } from "@/lib/forms/submissions";
import { formSchemaV1 } from "@/lib/forms/schema";

export interface ResponseRow { id: string; submitted_at: string; source: string | null; duration_ms: number | null; form_version_id: string; answers: Answers; hidden_fields: Record<string,string>; tags: string[]; edited_at: string | null }
export interface ResponseAnalytics { views: number; completions: number; completedVisits: number; avgSecs: number | null; fromQr: number; days: Record<string,number>; answers: Record<string,Array<{answer: Answers[string]; count: number}>>; reached: Record<string,number>; abandoned: number; inProgress: number }
export interface ResponseSearch { total: number; rows: ResponseRow[]; tags: string[] }
export async function readResponse(userId: string, formId: string, id: string): Promise<ResponseRow | null> {
  return withUserTransaction(userId, async db => (await db.query<ResponseRow>("select id,submitted_at::text,source,duration_ms::integer,form_version_id,answers,hidden_fields,tags,edited_at::text from submissions where id=$1 and form_id=$2 and deleted_at is null", [id,formId])).rows[0] ?? null);
}
export async function analytics(userId: string, formId: string, questions: string[]): Promise<ResponseAnalytics> {
  return withUserTransaction(userId, async db => (await db.query<{data:ResponseAnalytics}>("select platform.form_analytics($1,$2) as data", [formId,questions])).rows[0].data);
}
export async function searchResponses(userId: string, formId: string, filter: {q:string; tag:string; from:string|null; to:string|null; offset:number}): Promise<ResponseSearch> {
  return withUserTransaction(userId, async db => (await db.query<{data:ResponseSearch}>("select platform.search_responses($1,$2,$3,$4,$5,$6,100) as data", [formId,filter.q,filter.tag,filter.from,filter.to,filter.offset])).rows[0].data);
}
export async function editAnswer(userId: string, formId: string, id: string, blockId: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  return withUserTransaction(userId, async db => {
    const row = (await db.query<{answers:Answers;form_version_id:string}>("select answers,form_version_id from submissions where id=$1 and form_id=$2 and deleted_at is null for update", [id,formId])).rows[0];
    if (!row) return {ok:false,error:"Response unavailable or you do not have edit access."};
    const version = (await db.query<{schema:unknown}>("select schema from form_versions where id=$1 and form_id=$2", [row.form_version_id,formId])).rows[0];
    const parsed = formSchemaV1.safeParse(version?.schema);
    if (!parsed.success) return {ok:false,error:"The original form version is unavailable."};
    const applied = applyEditedAnswer(parsed.data,row.answers,blockId,value);
    if (!applied.ok) return applied;
    if ((await db.query("update submissions set answers=$1,edited_at=clock_timestamp() where id=$2 and form_id=$3 returning id", [JSON.stringify(applied.answers),id,formId])).rowCount!==1) return {ok:false,error:"Edit access is required."};
    await db.query("select platform.audit_response_edit($1,'submission.edited',$2)", [id,JSON.stringify({blockId})]);
    return {ok:true};
  });
}
export async function setTags(userId: string, formId: string, id: string, input: unknown): Promise<boolean> {
  return withUserTransaction(userId, async db => {
    const tags=normalizeTags(input);
    const changed=await db.query("update submissions set tags=$1 where id=$2 and form_id=$3 and deleted_at is null returning id", [tags,id,formId]);
    if(changed.rowCount!==1) return false;
    await db.query("select platform.audit_response_edit($1,'submission.tagged',$2)", [id,JSON.stringify({tags})]);
    return true;
  });
}
