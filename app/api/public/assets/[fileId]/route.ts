import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { presignedGetUrl } from "@/lib/r2";

/**
 * Public read for CREATOR assets only (logos, question images). Respondent
 * uploads are `kind = 'submission'` and are never served here. Redirects to
 * a 1-hour signed URL so the bucket itself stays private.
 */
export async function GET(_req: Request, { params }: { params: { fileId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.fileId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { data } = await admin
    .from("uploaded_files")
    .select("id, r2_key, status, kind, mime_type")
    .eq("id", params.fileId)
    .maybeSingle();
  const row = data as { r2_key: string; status: string; kind: string; mime_type: string } | null;
  if (
    !row ||
    row.status === "deleted" ||
    row.status === "quarantined" ||
    (row.kind !== "brand_asset" && row.kind !== "question_media") ||
    !row.mime_type.startsWith("image/")
  ) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const url = await presignedGetUrl(row.r2_key, 3600);
  if (!url) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "cache-control": "public, max-age=1800, s-maxage=1800" },
  });
}
