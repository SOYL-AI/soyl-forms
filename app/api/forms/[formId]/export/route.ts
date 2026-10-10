import { NextResponse } from "next/server";
import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import { submissionsToCsv, type CsvRow } from "@/lib/forms/csv";
import type { AnswerValue } from "@/types/forms";
import { isAzureBackend } from "@/lib/backend";
import { readForm, readOwnedVersion } from "@/lib/db/repositories/forms";
import { responseCsvStream } from "@/lib/db/export";

/**
 * Workspace-authorized CSV export. Columns follow the latest published
 * version's question order; answers stay keyed by stable ids so history
 * maps correctly. Matches the on-screen response data.
 */
export async function GET(_req: Request, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: 401 });
  }
  const form = owned.form;
  if (isAzureBackend()) {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({error:"Sign in required."},{status:401});
    const row = await readForm(userId,form.id);
    if (!row?.published_version_id) return NextResponse.json({error:"Nothing to export yet."},{status:400});
    const version = await readOwnedVersion(userId,form.id,row.published_version_id);
    const parsed = formSchemaV1.safeParse(version?.schema);
    if (!parsed.success) return NextResponse.json({error:"Form version unreadable."},{status:500});
    const stream = responseCsvStream(userId,form.id,parsed.data.blocks);
    if (!stream) return NextResponse.json({error:"Another export is running. Please try again shortly."},{status:429,headers:{"Retry-After":"5"}});
    const safe = form.title.replace(/[^A-Za-z0-9_-]+/g,"-").slice(0,60)||"responses";
    return new NextResponse(stream,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${safe}-responses.csv"`,"cache-control":"no-store"}});
  }

  const admin = getServiceSupabase();
  const { data: formRow } = await admin!
    .from("forms")
    .select("published_version_id")
    .eq("id", form.id)
    .single();
  const publishedId = (formRow as { published_version_id: string | null } | null)
    ?.published_version_id;
  if (!publishedId) {
    return NextResponse.json({ error: "Nothing to export yet." }, { status: 400 });
  }
  const { data: version } = await admin!
    .from("form_versions")
    .select("schema")
    .eq("id", publishedId)
    .single();
  const parsed = formSchemaV1.safeParse(
    (version as { schema: unknown } | null)?.schema,
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Form version unreadable." }, { status: 500 });
  }

  const supabase = await getServerSupabase();
  const { data } = await supabase!
    .from("submissions")
    .select("id, submitted_at, answers, hidden_fields, tags")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(5000);
  const rows: CsvRow[] = ((data ?? []) as Array<{
    id: string;
    submitted_at: string;
    answers: Record<string, AnswerValue>;
    hidden_fields: Record<string, string> | null;
    tags: string[] | null;
  }>).map((r) => ({
    id: r.id,
    submitted_at: r.submitted_at,
    answers: r.answers,
    hidden: r.hidden_fields ?? undefined,
    tags: r.tags ?? undefined,
  }));

  const csv = submissionsToCsv(parsed.data.blocks, rows);
  const safe = form.title.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "responses";
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}-responses.csv"`,
    },
  });
}
