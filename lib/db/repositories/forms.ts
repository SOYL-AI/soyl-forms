import { randomBytes } from "node:crypto";
import { withUserTransaction, getDatabasePool } from "@/lib/db/pool";
import type { FormSchemaV1, FormTheme, FormSettings } from "@/types/forms";

export interface CreatorForm {
  id: string; workspace_id: string; title: string; slug: string; status: string;
  draft_revision: number; draft_schema: FormSchemaV1; theme: FormTheme; settings: FormSettings;
  published_version_id: string | null; brand_kit_id: string | null;
}
export async function readForm(userId: string, formId: string, minimum: "viewer" | "editor" = "viewer"): Promise<CreatorForm | null> {
  return withUserTransaction(userId, async (db) => (await db.query<CreatorForm>(
    "select id,workspace_id,title,slug,status,draft_revision::integer,draft_schema,theme,settings,published_version_id,brand_kit_id from forms where id=$1 and platform.can_access(workspace_id,$2)", [formId, minimum])).rows[0] ?? null);
}
export async function insertForm(userId: string, workspaceId: string, schema: FormSchemaV1, theme: FormTheme = {}, settings: FormSettings = {}): Promise<string> {
  return withUserTransaction(userId, async (db) => {
    const row = (await db.query<{ id: string }>(
      "insert into forms(workspace_id,title,slug,draft_schema,theme,settings,created_by,brand_kit_id) values($1,$2,$3,$4,$5,$6,$7,nullif($5::jsonb->>'brandKitId','')::uuid) returning id",
      [workspaceId, schema.title, `f-${randomBytes(12).toString("base64url")}`, JSON.stringify(schema), JSON.stringify(theme), JSON.stringify(settings), userId])).rows[0];
    if (!row) throw new Error("Form could not be created");
    return row.id;
  });
}
export async function saveDraft(userId: string, input: { formId: string; revision: number; schema: FormSchemaV1; theme?: FormTheme; settings?: FormSettings }): Promise<boolean> {
  return withUserTransaction(userId, async (db) => (await db.query(
    `update forms set title=$1,draft_schema=$2,draft_revision=draft_revision+1,
      theme=coalesce($3::jsonb,theme),settings=coalesce($4::jsonb,settings),
      brand_kit_id=case when $3::jsonb is null then brand_kit_id else nullif($3::jsonb->>'brandKitId','')::uuid end,
      updated_at=clock_timestamp() where id=$5 and draft_revision=$6 returning id`,
    [input.schema.title, JSON.stringify(input.schema), input.theme === undefined ? null : JSON.stringify(input.theme),
      input.settings === undefined ? null : JSON.stringify(input.settings), input.formId, input.revision])).rowCount === 1);
}
export async function renameForm(userId: string, formId: string, title: string): Promise<boolean> {
  return withUserTransaction(userId, async (db) => (await db.query("update forms set title=$1,updated_at=clock_timestamp() where id=$2 returning id", [title, formId])).rowCount === 1);
}
export async function changeFormStatus(userId: string, formId: string, status: "draft" | "archived" | "closed"): Promise<boolean> {
  return withUserTransaction(userId, async (db) => (await db.query("update forms set status=$1,updated_at=clock_timestamp() where id=$2 returning id", [status, formId])).rowCount === 1);
}
export async function activeFormCount(userId: string, workspaceId: string, exclude?: string): Promise<number> {
  return withUserTransaction(userId, async (db) => Number((await db.query<{ count: string }>("select count(*) from forms where workspace_id=$1 and status='published' and ($2::uuid is null or id<>$2)", [workspaceId, exclude ?? null])).rows[0].count));
}
export async function reopenForm(userId: string, formId: string, maxActive: number): Promise<boolean> {
  return withUserTransaction(userId, async db => (await db.query<{ ok: boolean }>("select platform.reopen_form($1,$2) as ok", [formId, maxActive])).rows[0].ok);
}
export async function readOwnedVersion(userId: string, formId: string, versionId: string): Promise<PublicVersionRow | null> {
  return withUserTransaction(userId, async db => (await db.query<PublicVersionRow>("select id,version_number,schema,settings,theme from form_versions where id=$1 and form_id=$2", [versionId, formId])).rows[0] ?? null);
}
export async function publishForm(userId: string, input: { formId: string; schema: FormSchemaV1; theme: FormTheme; settings: FormSettings; maxActive: number }) {
  return withUserTransaction(userId, async (db) => {
    const row = (await db.query<{ version_id: string; version_number: number }>("select * from platform.publish_form($1,$2,$3,$4,$5)",
      [input.formId, JSON.stringify(input.schema), JSON.stringify(input.theme), JSON.stringify(input.settings), input.maxActive])).rows[0];
    if (!row) throw new Error("Publication could not be completed");
    return row;
  });
}
export interface PublicVersionRow { id: string; version_number: number; schema: unknown; settings: FormSettings; theme: Record<string, unknown> }
export interface PublicFormRow extends Omit<PublicVersionRow, "id"> { id: string; workspace_id: string; title: string; slug: string; status: string; version_id: string }
export async function readPublicForm(slug: string): Promise<PublicFormRow | null> {
  return (await getDatabasePool().query<{ form: PublicFormRow | null }>("select platform.resolve_public_form($1) as form", [slug])).rows[0]?.form ?? null;
}
export async function readPublicVersion(formId: string, versionId: string): Promise<PublicVersionRow | null> {
  return (await getDatabasePool().query<{ version: PublicVersionRow | null }>("select platform.resolve_form_version($1,$2) as version", [formId, versionId])).rows[0]?.version ?? null;
}
