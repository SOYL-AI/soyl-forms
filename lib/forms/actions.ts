"use server";

import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ensurePersonalWorkspace } from "@/lib/workspaces";
import { formSchemaV1, formSettingsSchema, formThemeSchema, validateLogicGraph } from "./schema";
import { buildStarterSchema } from "./builder";
import { themeRequiresPaidPlan } from "./themes";
import { getTemplate } from "./templates";
import { canPublishForm, PLANS } from "@/lib/plans";
import { getWorkspacePlan } from "@/lib/billing/plan";
import type { FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import { getAppUrl } from "@/lib/config";
import { encryptSecret, isSecretEncryptionConfigured, newWebhookSecret } from "@/lib/security/secrets";
import { deliverToWebhook } from "@/lib/webhooks/deliver";
import { applyEditedAnswer, normalizeTags } from "@/lib/forms/submissions";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function newSlug(): string {
  return `f-${Math.random().toString(36).slice(2, 10)}`;
}

interface OwnedForm {
  id: string;
  workspace_id: string;
  title: string;
  status: string;
  draft_revision: number;
}

/** Explicit workspace authorization: deny unless the user belongs to the form's workspace. */
async function getOwnedForm(
  formId: string,
  userId: string,
): Promise<{ form: OwnedForm } | { error: string }> {
  const admin = getServiceSupabase();
  if (!admin) return { error: "Service temporarily unavailable. Please try again." as const };

  const { data: form } = await admin
    .from("forms")
    .select("id, workspace_id, title, status, draft_revision")
    .eq("id", formId)
    .maybeSingle();
  const row = form as {
    id: string;
    workspace_id: string;
    title: string;
    status: string;
    draft_revision: number;
  } | null;
  if (!row) return { error: "Form not found." as const };

  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", row.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "You don't have access to this form." as const };

  return { form: row };
}

export async function createForm(args: {
  title: string;
}): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to create a form." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { workspaceId } = await ensurePersonalWorkspace(
    userId,
    user?.email ?? null,
  );

  const title = args.title.trim().slice(0, 200) || "Untitled form";
  const draft = buildStarterSchema(title);
  const { data, error } = await supabase
    .from("forms")
    .insert({
      workspace_id: workspaceId,
      title,
      slug: newSlug(),
      status: "draft",
      draft_schema: draft,
      draft_revision: 0,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: `Could not create form: ${error?.message}` };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function saveDraft(args: {
  formId: string;
  title: string;
  schema: unknown;
  revision: number;
  theme?: unknown;
  settings?: unknown;
}): Promise<ActionResult<{ revision: number }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to save." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };

  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };

  // Server re-validates everything the client checked.
  const parsed = formSchemaV1.safeParse(args.schema);
  if (!parsed.success) {
    return { ok: false, error: "This form has invalid questions and can't be saved." };
  }
  const graphErrors = validateLogicGraph(parsed.data);
  if (graphErrors.length > 0) {
    return { ok: false, error: graphErrors[0] as string };
  }
  if (owned.form.draft_revision !== args.revision) {
    return {
      ok: false,
      error:
        "This form changed elsewhere (newer draft exists). Reload to keep editing safely.",
    };
  }

  let theme: FormTheme | undefined;
  if (args.theme !== undefined) {
    const t = formThemeSchema.safeParse(args.theme);
    if (!t.success) return { ok: false, error: `Design: ${t.error.issues[0]?.message ?? "invalid value"}.` };
    theme = t.data;
  }
  let settings: FormSettings | undefined;
  if (args.settings !== undefined) {
    const st = formSettingsSchema.safeParse(args.settings);
    if (!st.success) {
      const issue = st.error.issues[0];
      return { ok: false, error: `Settings: ${issue?.path?.[0] ?? "field"} — ${issue?.message ?? "invalid value"}.` };
    }
    settings = st.data;
  }

  const title = args.title.trim().slice(0, 200) || "Untitled form";
  const schema = { ...parsed.data, title };
  const { error } = await supabase
    .from("forms")
    .update({
      title,
      draft_schema: schema,
      draft_revision: args.revision + 1,
      ...(theme !== undefined ? { theme, brand_kit_id: theme.brandKitId ?? null } : {}),
      ...(settings !== undefined ? { settings } : {}),
    })
    .eq("id", args.formId)
    .eq("draft_revision", args.revision);
  if (error) {
    return { ok: false, error: `Save failed: ${error.message}` };
  }
  return { ok: true, revision: args.revision + 1 };
}

export async function renameForm(args: {
  formId: string;
  title: string;
}): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const title = args.title.trim().slice(0, 200);
  if (!title) return { ok: false, error: "A form needs a name." };
  const { error } = await supabase
    .from("forms")
    .update({ title })
    .eq("id", args.formId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function duplicateForm(args: {
  formId: string;
}): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const admin = getServiceSupabase();
  const { data: source } = await admin!
    .from("forms")
    .select("workspace_id, title, draft_schema, theme, settings")
    .eq("id", args.formId)
    .single();
  const src = source as {
    workspace_id: string;
    title: string;
    draft_schema: unknown;
    theme: unknown;
    settings: unknown;
  } | null;
  if (!src) return { ok: false, error: "Form not found." };

  const { data, error } = await supabase
    .from("forms")
    .insert({
      workspace_id: src.workspace_id,
      title: `${src.title} (copy)`.slice(0, 200),
      slug: newSlug(),
      status: "draft",
      draft_schema: src.draft_schema,
      draft_revision: 0,
      theme: src.theme ?? {},
      settings: src.settings ?? {},
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: `Could not duplicate: ${error?.message}` };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function setFormArchived(args: {
  formId: string;
  archived: boolean;
}): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const { error } = await supabase
    .from("forms")
    .update({ status: args.archived ? "archived" : "draft" })
    .eq("id", args.formId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface OwnerForm {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  status: string;
  draft_revision: number;
}

/** Full owner row for server pages (auth + explicit workspace check inside). */
export async function getFormForOwner(
  formId: string,
): Promise<{ form: OwnerForm } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Sign in first." };
  const owned = await getOwnedForm(formId, userId);
  if ("error" in owned) return { error: owned.error };
  const admin = getServiceSupabase();
  const { data } = await admin!
    .from("forms")
    .select("id, workspace_id, title, slug, status, draft_revision")
    .eq("id", formId)
    .single();
  if (!data) return { error: "Form not found." };
  return { form: data as OwnerForm };
}

async function countActiveForms(workspaceId: string, excludeId?: string): Promise<number> {
  const admin = getServiceSupabase();
  let query = admin!
    .from("forms")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "published");
  if (excludeId) query = query.neq("id", excludeId);
  const { count } = await query;
  return count ?? 0;
}

/**
 * Publish: validate → enforce entitlement → immutable version → live URL.
 * Republishing an already-live form never consumes plan quota.
 */
export async function publishForm(args: {
  formId: string;
}): Promise<ActionResult<{ url: string; version: number }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const admin = getServiceSupabase();
  const { data: row } = await admin!
    .from("forms")
    .select("workspace_id, title, slug, status, draft_schema, theme, settings")
    .eq("id", args.formId)
    .single();
  const full = row as {
    workspace_id: string;
    title: string;
    slug: string;
    status: string;
    draft_schema: unknown;
    theme: unknown;
    settings: unknown;
  } | null;
  if (!full) return { ok: false, error: "Form not found." };

  const parsed = formSchemaV1.safeParse(full.draft_schema);
  if (!parsed.success) {
    return { ok: false, error: "Fix invalid questions before publishing." };
  }
  const graphErrors = validateLogicGraph(parsed.data);
  if (graphErrors.length > 0) {
    return { ok: false, error: graphErrors[0] as string };
  }
  if (!parsed.data.blocks.some((b) => b.type !== "welcome" && b.type !== "statement" && b.type !== "thank_you")) {
    return { ok: false, error: "Add at least one question before publishing." };
  }

  const plan = await getWorkspacePlan(full.workspace_id);
  const activeForms = await countActiveForms(full.workspace_id, args.formId);
  const gate = canPublishForm({
    plan,
    activeForms,
    republishingActive: full.status === "published",
  });
  if (!gate.ok) return { ok: false, error: gate.reason ?? "Plan limit reached." };
  if (!PLANS[plan].entitlements.customThemes) {
    const reason = themeRequiresPaidPlan(full.theme);
    if (reason) return { ok: false, error: `${reason} Upgrade to Starter to publish this design, or pick a preset.` };
  }
  if (!PLANS[plan].entitlements.paymentCollection && parsed.success && parsed.data.blocks.some((b) => b.type === "payment")) {
    return { ok: false, error: "Payment collection is a Starter feature. Remove the payment step or upgrade your plan to publish." };
  }
  if (!PLANS[plan].entitlements.emailNotifications) {
    const st = formSettingsSchema.safeParse(full.settings);
    if (st.success && ((st.data.notifyEmails && st.data.notifyEmails.length > 0) || st.data.responderEnabled)) {
      return { ok: false, error: "Email notifications are a Starter feature. Clear the notification emails or upgrade your plan to publish." };
    }
  }

  const schema = { ...parsed.data, title: full.title };
  const { data: versions, error } = await admin!.rpc("publish_form", {
    p_form_id: args.formId,
    p_schema: schema,
    p_theme: full.theme ?? {},
    p_settings: full.settings ?? {},
    p_published_by: userId,
  });
  if (error || !versions || (versions as Array<{ version_id: string; version_number: number }>).length === 0) {
    return { ok: false, error: `Publish failed: ${error?.message ?? "unknown error"}` };
  }
  const v = (versions as Array<{ version_id: string; version_number: number }>)[0] as {
    version_id: string;
    version_number: number;
  };
  return { ok: true, url: `${getAppUrl()}/f/${full.slug}`, version: v.version_number };
}

export async function closeForm(args: { formId: string }): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const { error } = await supabase
    .from("forms")
    .update({ status: "closed" })
    .eq("id", args.formId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface WebhookSummary {
  id: string;
  url: string;
  is_active: boolean;
  events: string[];
  created_at: string;
}

/** Webhooks for a form (owner-checked). Secrets are never listed. */
export async function listWebhooks(args: {
  formId: string;
}): Promise<{ webhooks: WebhookSummary[] } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Sign in first." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { error: owned.error };
  const admin = getServiceSupabase();
  const { data } = await admin!
    .from("webhooks")
    .select("id, url, is_active, events, created_at")
    .eq("form_id", args.formId)
    .order("created_at", { ascending: false });
  return { webhooks: ((data ?? []) as WebhookSummary[]) };
}

interface OwnedHook {
  id: string;
  form_id: string;
  url: string;
  is_active: boolean;
}

async function getOwnedWebhook(
  webhookId: string,
  userId: string,
): Promise<{ hook: OwnedHook } | { error: string }> {
  const admin = getServiceSupabase();
  const { data } = await admin!
    .from("webhooks")
    .select("id, form_id, url, is_active")
    .eq("id", webhookId)
    .maybeSingle();
  const hook = data as OwnedHook | null;
  if (!hook) return { error: "Webhook not found." };
  const owned = await getOwnedForm(hook.form_id, userId);
  if ("error" in owned) return { error: owned.error };
  return { hook };
}

/** Create a webhook. Returns the secret ONCE — it is stored encrypted. */
export async function createWebhook(args: {
  formId: string;
  url: string;
}): Promise<ActionResult<{ id: string; secret: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };
  if (!isSecretEncryptionConfigured()) {
    return {
      ok: false,
      error: "Integrations are temporarily unavailable. Please try again later.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(args.url.trim());
  } catch {
    return { ok: false, error: "Enter a valid https URL." };
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) {
    return { ok: false, error: "The URL must start with https://." };
  }

  const admin = getServiceSupabase();
  const plan = await getWorkspacePlan(owned.form.workspace_id);
  const { count } = await admin!
    .from("webhooks")
    .select("id", { count: "exact", head: true })
    .eq("form_id", args.formId);
  const maxHooks = PLANS[plan].entitlements.maxWebhooksPerForm;
  if ((count ?? 0) >= maxHooks) {
    return { ok: false, error: `Your ${PLANS[plan].name} plan allows ${maxHooks} webhook(s) per form.` };
  }

  const secret = newWebhookSecret();
  const { data, error } = await admin!
    .from("webhooks")
    .insert({
      workspace_id: owned.form.workspace_id,
      form_id: args.formId,
      url: parsed.toString(),
      secret_encrypted: encryptSecret(secret),
      is_active: true,
      events: ["form.submission.completed"],
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: `Could not create webhook: ${error?.message}` };
  }
  return { ok: true, id: (data as { id: string }).id, secret };
}

export async function deleteWebhook(args: { webhookId: string }): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const found = await getOwnedWebhook(args.webhookId, userId);
  if ("error" in found) return { ok: false, error: found.error };
  const admin = getServiceSupabase();
  const { error } = await admin!.from("webhooks").delete().eq("id", args.webhookId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setWebhookActive(args: {
  webhookId: string;
  active: boolean;
}): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const found = await getOwnedWebhook(args.webhookId, userId);
  if ("error" in found) return { ok: false, error: found.error };
  const admin = getServiceSupabase();
  const { error } = await admin!
    .from("webhooks")
    .update({ is_active: args.active })
    .eq("id", args.webhookId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Send a sample event to verify the endpoint + signature. */
export async function testWebhook(args: {
  webhookId: string;
}): Promise<ActionResult<{ status: number | null }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const found = await getOwnedWebhook(args.webhookId, userId);
  if ("error" in found) return { ok: false, error: found.error };
  const res = await deliverToWebhook(
    args.webhookId,
    {
      eventId: `test-${Date.now()}`,
      formId: found.hook.form_id,
      submissionId: "test",
      submittedAt: new Date().toISOString(),
      answers: { note: "This is a test delivery." },
    },
    1,
  );
  if (!res.ok) {
    return { ok: false, error: `Delivery failed${res.httpStatus ? ` (HTTP ${res.httpStatus})` : ""}: ${res.error ?? "check the URL"}` };
  }
  return { ok: true, status: res.httpStatus };
}

/** Reopen a closed form (re-checks the active-form entitlement). */
export async function reopenForm(args: { formId: string }): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const owned = await getOwnedForm(args.formId, userId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const admin = getServiceSupabase();
  const { data: row } = await admin!
    .from("forms")
    .select("workspace_id, published_version_id")
    .eq("id", args.formId)
    .single();
  const full = row as { workspace_id: string; published_version_id: string | null } | null;
  if (!full?.published_version_id) {
    return { ok: false, error: "Publish this form before reopening it." };
  }
  const plan = await getWorkspacePlan(full.workspace_id);
  const activeForms = await countActiveForms(full.workspace_id, args.formId);
  const gate = canPublishForm({ plan, activeForms });
  if (!gate.ok) return { ok: false, error: gate.reason ?? "Plan limit reached." };

  const { error } = await supabase
    .from("forms")
    .update({ status: "published" })
    .eq("id", args.formId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Create a form from a starter template (schema + theme + settings). */
export async function createFormFromTemplate(args: {
  templateId: string;
}): Promise<ActionResult<{ id: string }>> {
  const template = getTemplate(args.templateId);
  if (!template) return { ok: false, error: "That template doesn't exist." };
  return createFormFromDraft({
    title: template.name,
    schema: template.schema,
    theme: template.theme,
    settings: template.settings,
  });
}

/**
 * Create a form with a ready-made draft (templates, AI Studio). Everything is
 * validated server-side; the form starts as an unpublished draft.
 */
export async function createFormFromDraft(args: {
  title: string;
  schema: unknown;
  theme?: unknown;
  settings?: unknown;
}): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to create a form." };
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };

  const parsed = formSchemaV1.safeParse(args.schema);
  if (!parsed.success) return { ok: false, error: "This draft has invalid questions." };
  const graphErrors = validateLogicGraph(parsed.data);
  if (graphErrors.length > 0) return { ok: false, error: graphErrors[0] as string };
  const theme = args.theme !== undefined ? formThemeSchema.safeParse(args.theme) : null;
  if (theme && !theme.success) return { ok: false, error: "This draft has an invalid design." };
  const settings = args.settings !== undefined ? formSettingsSchema.safeParse(args.settings) : null;
  if (settings && !settings.success) return { ok: false, error: "This draft has invalid settings." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { workspaceId } = await ensurePersonalWorkspace(userId, user?.email ?? null);
  const title = args.title.trim().slice(0, 200) || parsed.data.title || "Untitled form";
  const schema: FormSchemaV1 = { ...parsed.data, title };
  const { data, error } = await supabase
    .from("forms")
    .insert({
      workspace_id: workspaceId,
      title,
      slug: newSlug(),
      status: "draft",
      draft_schema: schema,
      draft_revision: 0,
      theme: theme?.success ? theme.data : {},
      settings: settings?.success ? settings.data : {},
      brand_kit_id: theme?.success ? theme.data.brandKitId ?? null : null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `Could not create form: ${error?.message}` };
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Response editing + tagging. Editors and above only — viewers get
 * read-only responses (mirrors the editors_write_forms RLS rank). Every
 * mutation is audit-logged with the actor and the changed question.
 */
async function getEditableSubmission(
  formId: string,
  submissionId: string,
  userId: string,
): Promise<
  | {
      workspaceId: string;
      answers: Record<string, unknown>;
      schema: { blocks: FormSchemaV1["blocks"]; logic: FormSchemaV1["logic"] };
    }
  | { error: string }
> {
  const admin = getServiceSupabase();
  if (!admin) return { error: "Service temporarily unavailable. Please try again." };
  const owned = await getOwnedForm(formId, userId);
  if ("error" in owned) return { error: owned.error };
  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", owned.form.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (member as { role: string } | null)?.role;
  if (!["owner", "admin", "editor"].includes(role ?? "")) {
    return { error: "Viewers can\u2019t edit responses." };
  }
  const { data: sub } = await admin
    .from("submissions")
    .select("id, answers, form_version_id")
    .eq("id", submissionId)
    .eq("form_id", formId)
    .is("deleted_at", null)
    .maybeSingle();
  const submission = sub as { id: string; answers: Record<string, unknown>; form_version_id: string } | null;
  if (!submission) return { error: "Response not found." };
  const { data: version } = await admin
    .from("form_versions")
    .select("schema")
    .eq("id", submission.form_version_id)
    .maybeSingle();
  const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
  if (!parsed.success) return { error: "This response\u2019s form version is no longer readable." };
  return { workspaceId: owned.form.workspace_id, answers: submission.answers ?? {}, schema: { blocks: parsed.data.blocks, logic: parsed.data.logic } };
}

async function auditSubmissionEdit(args: {
  actorUserId: string;
  workspaceId: string;
  action: string;
  submissionId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const admin = getServiceSupabase();
  if (!admin) return;
  await admin.from("audit_logs").insert({
    actor_user_id: args.actorUserId,
    actor_type: "user",
    workspace_id: args.workspaceId,
    action: args.action,
    target_type: "submission",
    target_id: args.submissionId,
    metadata: args.metadata,
  });
}

/** Fix a respondent's answer (typo, wrong option). Re-validates everything. */
export async function updateSubmissionAnswer(args: {
  formId: string;
  submissionId: string;
  blockId: string;
  value: unknown;
}): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const ctx = await getEditableSubmission(args.formId, args.submissionId, userId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const applied = applyEditedAnswer(ctx.schema, ctx.answers, args.blockId, args.value);
  if (!applied.ok) return { ok: false, error: applied.error };
  const admin = getServiceSupabase();
  const { error } = await admin!
    .from("submissions")
    .update({ answers: applied.answers, edited_at: new Date().toISOString() })
    .eq("id", args.submissionId)
    .eq("form_id", args.formId);
  if (error) return { ok: false, error: "Couldn\u2019t save the edit." };
  await auditSubmissionEdit({
    actorUserId: userId,
    workspaceId: ctx.workspaceId,
    action: "submission.edited",
    submissionId: args.submissionId,
    metadata: { blockId: args.blockId },
  });
  return { ok: true };
}

/** Replace a response's tags (used for triage, approvals, follow-ups). */
export async function setSubmissionTags(args: {
  formId: string;
  submissionId: string;
  tags: unknown;
}): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const ctx = await getEditableSubmission(args.formId, args.submissionId, userId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const tags = normalizeTags(args.tags);
  const admin = getServiceSupabase();
  const { error } = await admin!
    .from("submissions")
    .update({ tags })
    .eq("id", args.submissionId)
    .eq("form_id", args.formId);
  if (error) return { ok: false, error: "Couldn\u2019t save the tags." };
  await auditSubmissionEdit({
    actorUserId: userId,
    workspaceId: ctx.workspaceId,
    action: "submission.tagged",
    submissionId: args.submissionId,
    metadata: { tags },
  });
  return { ok: true };
}
