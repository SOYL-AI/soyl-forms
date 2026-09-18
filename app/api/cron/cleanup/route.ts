import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/r2";

/**
 * Orphan cleanup: unattached `pending` uploads older than 24h are deleted
 * from R2 and their rows removed. Same CRON_SECRET scheduler as outbox.
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; scheduler disabled." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: orphans } = await admin
    .from("uploaded_files")
    .select("id, r2_key")
    .eq("status", "pending")
    .is("submission_id", null)
    .lt("created_at", cutoff)
    .limit(100);

  let cleaned = 0;
  for (const f of (orphans ?? []) as Array<{ id: string; r2_key: string }>) {
    try {
      await deleteR2Object(f.r2_key);
    } catch {
      // Row cleanup proceeds regardless; R2 lifecycle rules are the backstop.
    }
    await admin.from("uploaded_files").delete().eq("id", f.id);
    cleaned += 1;
  }
  return NextResponse.json({ ok: true, cleaned });
}
