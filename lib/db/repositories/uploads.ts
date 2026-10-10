import { getDatabasePool, withUserTransaction } from "@/lib/db/pool";
import type { UploadRow } from "@/lib/uploads/verify";

export interface FileReservation {
  id:string; workspace_id:string; form_id:string|null; brand_kit_id?:string|null;
  kind:string; question_id:string|null; r2_key:string; original_name:string;
  mime_type:string; size_bytes:number; upload_token_hash?:string; status?:string;
}
export async function reserveFile(userId:string|null, file:FileReservation, limit:number, version:string|null=null):Promise<boolean> {
  const work=async (db:Pick<ReturnType<typeof getDatabasePool>,"query">) => (await db.query<{ok:boolean}>("select platform.reserve_file($1,$2,$3) as ok",[JSON.stringify(file),limit,version])).rows[0].ok;
  return userId ? withUserTransaction(userId,work) : work(getDatabasePool());
}
export async function readUpload(userId:string|null,id:string,formId:string|null=null,tokenHash:string|null=null):Promise<UploadRow|null> {
  const work=async (db:Pick<ReturnType<typeof getDatabasePool>,"query">) => (await db.query<{data:UploadRow|null}>("select platform.read_upload($1,$2,$3) as data",[id,formId,tokenHash])).rows[0].data;
  return userId ? withUserTransaction(userId,work) : work(getDatabasePool());
}
export async function freezeFile(userId:string|null,row:UploadRow,key:string,tokenHash:string|null):Promise<boolean> {
  const work=async (db:Pick<ReturnType<typeof getDatabasePool>,"query">) => (await db.query<{ok:boolean}>("select platform.finalize_file($1,$2,$3,$4) as ok",[row.id,row.r2_key,key,tokenHash])).rows[0].ok;
  return userId ? withUserTransaction(userId,work) : work(getDatabasePool());
}
export async function publicAsset(id:string):Promise<Pick<UploadRow,"r2_key"|"status"|"kind"|"mime_type">|null> {
  return (await getDatabasePool().query<{data:Pick<UploadRow,"r2_key"|"status"|"kind"|"mime_type">|null}>("select platform.public_asset($1) as data",[id])).rows[0].data;
}
export async function brandSources(userId:string,workspaceId:string,ids:string[]) {
  return withUserTransaction(userId,async db => (await db.query<{id:string;r2_key:string;mime_type:string;original_name:string}>("select id,r2_key,mime_type,original_name from uploaded_files where workspace_id=$1 and id=any($2::uuid[]) and kind='brand_source' and status='attached' and verified_at is not null",[workspaceId,ids])).rows);
}
