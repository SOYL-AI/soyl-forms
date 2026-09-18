import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import { submissionsToCsv, type CsvRow } from "@/lib/forms/csv";
import type { AnswerValue } from "@/types/forms";

/**
 * Workspace-authorized CSV export. Columns follow the latest published
 * version's question order; answers stay keyed by stable ids so history
 * maps correctly. Matches the on-screen response data.
 */
export async function GET(
  _req: Request,
  { params }: { params: { formId: string } },
) {
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: 401 });
  }
  const form = owned.form;

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

  const supabase = getServerSupabase();
  const { data } = await supabase!
    .from("submissions")
    .select("id, submitted_at, answers")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(5000);
  const rows: CsvRow[] = ((data ?? []) as Array<{
    id: string;
    submitted_at: string;
    answers: Record<string, AnswerValue>;
  }>);

  const csv = submissionsToCsv(parsed.data.blocks, rows);
  const safe = form.title.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "responses";
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}-responses.csv"`,
    },
  });
}
