import { getServiceSupabase } from "@/lib/supabase/admin";
import { formSchemaV1 } from "./schema";
import type { FormSchemaV1, FormSettings } from "@/types/forms";

export interface PublicForm {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: string;
  settings: FormSettings;
  theme: Record<string, unknown>;
  versionId: string;
  schema: FormSchemaV1;
  versionNumber: number;
}

/** Resolve a public slug to its live published version. Never exposes owner data. */
export async function resolvePublicForm(
  slug: string,
): Promise<{ form: PublicForm } | { error: string; status: number }> {
  const admin = getServiceSupabase();
  if (!admin) return { error: "Forms are temporarily unavailable.", status: 503 };

  const { data: row } = await admin
    .from("forms")
    .select("id, workspace_id, title, slug, status, settings, theme, published_version_id")
    .eq("slug", slug)
    .maybeSingle();
  const form = row as {
    id: string;
    workspace_id: string;
    title: string;
    slug: string;
    status: string;
    settings: PublicForm["settings"];
    theme: Record<string, unknown>;
    published_version_id: string | null;
  } | null;

  if (!form || !form.published_version_id) {
    return { error: "This form isn't available.", status: 404 };
  }
  const { data: version } = await admin
    .from("form_versions")
    .select("id, version_number, schema, settings, theme")
    .eq("id", form.published_version_id)
    .maybeSingle();
  const v = version as {
    id: string;
    version_number: number;
    schema: unknown;
    settings: PublicForm["settings"];
    theme: Record<string, unknown>;
  } | null;
  if (!v) return { error: "This form isn't available.", status: 404 };

  const parsed = formSchemaV1.safeParse(v.schema);
  if (!parsed.success) {
    return { error: "This form isn't available right now.", status: 410 };
  }
  return {
    form: {
      id: form.id,
      workspaceId: form.workspace_id,
      title: form.title,
      slug: form.slug,
      status: form.status,
      settings: { ...(v.settings ?? {}), ...(form.settings ?? {}) },
      theme: (v.theme ?? {}) as Record<string, unknown>,
      versionId: v.id,
      schema: { ...parsed.data, title: form.title },
      versionNumber: v.version_number,
    },
  };
}

/** Is this published form currently accepting responses? */
export function formAcceptance(form: {
  status: string;
  settings: PublicForm["settings"];
}): { open: boolean; message: string } {
  const closedMessage =
    form.settings.closedMessage ?? "This form is no longer accepting responses.";
  if (form.status === "closed" || form.status === "archived") {
    return { open: false, message: closedMessage };
  }
  if (form.status !== "published") {
    return { open: false, message: "This form isn't available." };
  }
  if (form.settings.closeAt) {
    const closeAt = new Date(form.settings.closeAt);
    if (!Number.isNaN(closeAt.getTime()) && closeAt.getTime() <= Date.now()) {
      return { open: false, message: closedMessage };
    }
  }
  return { open: true, message: "" };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
