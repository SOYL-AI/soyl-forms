import { processAccountDeletion } from "@/lib/account/azure-delete";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/r2";
import { isAzureBackend } from "@/lib/backend";
import { cleanupUploads,completeCleanup,cleanupExpiredData } from "@/lib/db/repositories/jobs";

/** Expire unattached uploads before deleting their objects; failed deletions retry. */
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
  if(isAzureBackend()) {
    try {
      const deadline=Date.now()+60_000;
      let cleaned=0;
      for(const file of await cleanupUploads()) {
        if(Date.now()>deadline-40_000) break;
        try {await deleteR2Object(file.r2_key);if(await completeCleanup(file.id,file.r2_key)) cleaned++;}
        catch { /* Preserve the deleted row so object deletion retries next sweep. */ }
      }
      return NextResponse.json({ok:true,cleaned,partialsCleaned:await cleanupExpiredData(),accountDeletion:await processAccountDeletion(deadline)});
    } catch {return NextResponse.json({error:'Cleanup could not finish. Please retry.'},{status:503});}
  }
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: orphans } = await admin
    .from("uploaded_files")
    .select("id, r2_key, status")
    .in("status", ["pending", "deleted"])
    .is("submission_id", null)
    .lt("created_at", cutoff)
    .limit(100);

  let cleaned = 0;
  for (const f of (orphans ?? []) as Array<{ id: string; r2_key: string; status: string }>) {
    let target = f;
    if (f.status === "pending") {
      const { data, error } = await admin.rpc("expire_pending_upload", { p_id: f.id, p_cutoff: cutoff });
      if (error || !data) continue;
      target = data as typeof f;
    }
    try {
      await deleteR2Object(target.r2_key);
      const { error } = await admin.from("uploaded_files").delete().eq("id", target.id).eq("status", "deleted");
      if (!error) cleaned += 1;
    } catch {
      // Keep the deleted row so the next sweep can retry object removal.
    }
  }
  // Resume links expire after 30 days of silence (answers belong to the
  // respondent; nothing submitted is ever swept here).
  const stalePartials = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: partials } = await admin
    .from("partial_responses")
    .select("id")
    .lt("updated_at", stalePartials)
    .limit(100);
  let partialsCleaned = 0;
  for (const pr of (partials ?? []) as Array<{ id: string }>) {
    await admin.from("partial_responses").delete().eq("id", pr.id).lt("updated_at", stalePartials);
    partialsCleaned += 1;
  }
  await admin.from("public_rate_limits").delete().lt("reset_at", cutoff);
  await admin.from("email_reservations").update({ request: {} }).lt("created_at", cutoff).eq("status", "reserved");
  return NextResponse.json({ ok: true, cleaned, partialsCleaned });
}
