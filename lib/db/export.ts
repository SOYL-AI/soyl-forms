import { getDatabasePool } from "./pool";
import { submissionsToCsv, type CsvRow } from "@/lib/forms/csv";
import type { Block, Answers } from "@/types/forms";
import type { PoolClient } from "pg";

const exportState = globalThis as typeof globalThis & { soylActiveExport?: symbol };
/** One export per process leaves two pool slots for interactive requests. The
 * database cursor gives a consistent snapshot without loading every answer into
 * app memory, and always closes on completion, timeout or client cancellation. */
export function responseCsvStream(userId: string, formId: string, blocks: Block[]): ReadableStream<Uint8Array> | null {
  if (exportState.soylActiveExport) return null;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid actor");
  const lease = Symbol("response-export");
  exportState.soylActiveExport = lease;
  let expired = false;
  const release = () => {
    clearTimeout(deadline);
    if (exportState.soylActiveExport === lease) delete exportState.soylActiveExport;
  };
  const deadline = setTimeout(() => { expired = true; void iterator.return(undefined).catch(() => {}).finally(release); }, 60_000);
  deadline.unref();
  async function* chunks(): AsyncGenerator<Uint8Array, void, unknown> {
    let db: PoolClient | undefined;
    let discard = false;
    try {
      db = await getDatabasePool().connect();
      await db.query("begin isolation level repeatable read read only");
      await db.query("select set_config('app.user_id',$1,true)", [userId]);
      const allowed = (await db.query<{allowed:boolean}>("select platform.can_access(workspace_id) as allowed from forms where id=$1", [formId])).rows[0]?.allowed;
      if (!allowed) throw new Error("Response access is no longer available");
      const metadata = (await db.query<{hidden_keys:string[]; has_tags:boolean}>(`select
        array(select distinct hidden.key from submissions s cross join lateral jsonb_object_keys(s.hidden_fields) as hidden(key) where s.form_id=$1 and s.deleted_at is null order by hidden.key) as hidden_keys,
        exists(select 1 from submissions where form_id=$1 and deleted_at is null and cardinality(tags)>0) as has_tags`, [formId])).rows[0];
      await db.query("declare response_export no scroll cursor for select id,submitted_at::text,answers,hidden_fields,tags from submissions where form_id=$1 and deleted_at is null order by submitted_at,id", [formId]);
      const encoder = new TextEncoder();
      let includeHeader = true;
      while (!expired) {
        const rows = (await db.query<{id:string; submitted_at:string; answers:Answers; hidden_fields:Record<string,string>; tags:string[]}>("fetch forward 250 from response_export")).rows;
        if (!rows.length && !includeHeader) break;
        const formatted: CsvRow[] = rows.map(row => ({id:row.id,submitted_at:row.submitted_at,answers:row.answers,hidden:row.hidden_fields,tags:row.tags}));
        yield encoder.encode(submissionsToCsv(blocks,formatted,{hiddenKeys:metadata.hidden_keys,hasTags:metadata.has_tags,includeHeader}));
        includeHeader = false;
        if (!rows.length) break;
      }
      if (expired) throw new Error("Export timed out. Please try again.");
      await db.query("commit");
    } finally {
      if (db) {
        try { await db.query("rollback"); } catch { discard = true; }
        db.release(discard);
      }
      release();
    }
  }
  const iterator = chunks();
  return new ReadableStream({
    async pull(controller) {
      try {
        if (expired) throw new Error("Export timed out. Please try again.");
        const next = await iterator.next();
        if (next.done) controller.close(); else controller.enqueue(next.value);
      } catch { try { await iterator.return(undefined); } finally { release(); } controller.error(new Error("Export could not be completed. Please try again.")); }
    },
    async cancel() { try { await iterator.return(undefined); } finally { release(); } },
  });
}
