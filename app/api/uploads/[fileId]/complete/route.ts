import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { getUserWorkspaceId } from "@/lib/workspaces";

/** Mark a creator asset as attached once the browser's PUT succeeded. */
export async function POST(_req: Request, { params }: { params: { fileId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data } = await admin!
    .from("uploaded_files")
    .update({ status: "attached" })
    .eq("id", params.fileId)
    .eq("workspace_id", workspaceId)
    .neq("kind", "submission")
    .select("id")
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
