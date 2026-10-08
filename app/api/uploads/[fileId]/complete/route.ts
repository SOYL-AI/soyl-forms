import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { finalizeUpload, type UploadRow } from "@/lib/uploads/verify";
import { hasWorkspaceRole } from "@/lib/security/workspace";

/** Mark a creator asset as attached once the browser's PUT succeeded. */
export async function POST(_req: Request, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  if (!(await hasWorkspaceRole(workspaceId, "editor"))) return NextResponse.json({ error: "Editing permission is required." }, { status: 403 });
  const admin = getServiceSupabase();
  const { data } = await admin!
    .from("uploaded_files")
    .select("*")
    .eq("id", params.fileId)
    .eq("workspace_id", workspaceId)
    .neq("kind", "submission")
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const result = await finalizeUpload(data as UploadRow);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
