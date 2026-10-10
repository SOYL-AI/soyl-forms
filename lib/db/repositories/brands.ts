import { withUserTransaction } from "@/lib/db/pool";
import type { BrandKitRow } from "@/lib/brand/types";
export async function listBrands(userId: string, workspaceId: string): Promise<BrandKitRow[]> {
  return withUserTransaction(userId, async db => (await db.query<BrandKitRow>("select b.*,created_at::text,updated_at::text from brand_kits b where workspace_id=$1 order by is_default desc,updated_at desc,id", [workspaceId])).rows);
}
export async function readBrand(userId: string, workspaceId: string, id: string): Promise<BrandKitRow | null> {
  return withUserTransaction(userId, async db => (await db.query<BrandKitRow>("select b.*,created_at::text,updated_at::text from brand_kits b where workspace_id=$1 and id=$2", [workspaceId, id])).rows[0] ?? null);
}
export async function saveBrand(userId: string, workspaceId: string, id: string | undefined, input: Record<string, unknown>, max: number): Promise<string> {
  return withUserTransaction(userId, async db => (await db.query<{ id: string }>("select platform.save_brand_kit($1,$2,$3,$4) as id", [workspaceId, id ?? null, JSON.stringify(input), max])).rows[0].id);
}
export async function defaultBrand(userId: string, workspaceId: string, id: string): Promise<boolean> {
  return withUserTransaction(userId, async db => (await db.query<{ ok: boolean }>("select platform.default_brand_kit($1,$2) as ok", [workspaceId, id])).rows[0].ok);
}
export async function deleteBrand(userId: string, workspaceId: string, id: string): Promise<boolean> {
  return withUserTransaction(userId, async db => (await db.query<{ ok: boolean }>("select platform.delete_brand_kit($1,$2) as ok", [workspaceId, id])).rows[0].ok);
}
