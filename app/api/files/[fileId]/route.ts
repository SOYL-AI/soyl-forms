import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { presignedGetUrl } from "@/lib/r2";

/** Owner-authorized download: verifies workspace membership, then redirects
 * to a 5-minute signed URL. Objects are never public. */
export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const admin = getServiceSupabase();
  const { data: file } = await admin!
    .from("uploaded_files")
    .select("id, workspace_id, r2_key, status")
    .eq("id", params.fileId)
    .maybeSingle();
  const row = file as {
    id: string;
    workspace_id: string;
    r2_key: string;
    status: string;
  } | null;
  if (!row || row.status === "deleted") {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const { data: member } = await admin!
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", row.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "No access to this file." }, { status: 403 });
  }
  const url = await presignedGetUrl(row.r2_key);
  if (!url) {
    return NextResponse.json({ error: "Download unavailable." }, { status: 503 });
  }
  return NextResponse.redirect(url);
}
