import { getEntraSessionUser } from "@/lib/auth/session";
import * as repository from "@/lib/db/repositories/forms";
import { ensureWorkspace, readWorkspacePlan } from "@/lib/db/repositories/workspaces";
import { buildStarterSchema } from "./builder";
import { formSchemaV1, formSettingsSchema, formThemeSchema, validateLogicGraph } from "./schema";
import { themeRequiresPaidPlan } from "./themes";
import { PLANS } from "@/lib/plans";
import { getAppUrl } from "@/lib/config";
import type { ActionResult, OwnerForm } from "./actions";
import type { FormSchemaV1 } from "@/types/forms";

async function actor() {
  const user = await getEntraSessionUser();
  if (!user) throw new Error("Sign in first.");
  return user;
}
async function handle<T extends object>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, ...await work() }; }
  catch (error) {
    // SQL errors can contain submitted values. Log only a safe event/code.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
    if (code) console.error(JSON.stringify({ event: "azure_form_action_failed", code: /^[A-Z0-9]{5}$/.test(code) ? code : "unknown" }));
    return { ok: false, error: code ? "Could not complete the change. Check your access and try again." : error instanceof Error ? error.message : "Please try again." };
  }
}
function checkedSchema(input: unknown): FormSchemaV1 {
  const parsed = formSchemaV1.safeParse(input);
  if (!parsed.success) throw new Error("This form has invalid questions. Fix them before saving.");
  const errors = validateLogicGraph(parsed.data);
  if (errors.length) throw new Error(errors[0]);
  return parsed.data;
}
export async function createForm(input: { title: string }) {
  return handle(async () => {
    const user = await actor();
    const { workspaceId } = await ensureWorkspace(user.id);
    const title = input.title.trim().slice(0, 200) || "Untitled form";
    return { id: await repository.insertForm(user.id, workspaceId, buildStarterSchema(title)) };
  });
}
export async function createFormFromDraft(input: { title: string; schema: unknown; theme?: unknown; settings?: unknown }) {
  return handle(async () => {
    const user = await actor();
    const schema = checkedSchema(input.schema);
    const theme = formThemeSchema.safeParse(input.theme ?? {});
    const settings = formSettingsSchema.safeParse(input.settings ?? {});
    if (!theme.success || !settings.success) throw new Error("This draft has invalid design or settings.");
    const { workspaceId } = await ensureWorkspace(user.id);
    return { id: await repository.insertForm(user.id, workspaceId, { ...schema, title: input.title.trim().slice(0, 200) || schema.title || "Untitled form" }, theme.data, settings.data) };
  });
}
export async function reopenForm(input: { formId: string }) {
  return handle(async () => {
    const user = await actor();
    const form = await repository.readForm(user.id, input.formId, "editor");
    if (!form?.published_version_id) throw new Error("Publish this form before reopening it.");
    const plan = await readWorkspacePlan(user.id, form.workspace_id);
    if (!await repository.reopenForm(user.id, form.id, PLANS[plan].entitlements.maxActiveForms)) throw new Error("The active form limit has been reached.");
    return {};
  });
}
export async function saveDraft(input: { formId: string; title: string; schema: unknown; revision: number; theme?: unknown; settings?: unknown }) {
  return handle(async () => {
    const user = await actor();
    const schema = { ...checkedSchema(input.schema), title: input.title.trim().slice(0, 200) || "Untitled form" };
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("Invalid draft revision.");
    const theme = input.theme === undefined ? undefined : formThemeSchema.safeParse(input.theme);
    const settings = input.settings === undefined ? undefined : formSettingsSchema.safeParse(input.settings);
    if (theme && !theme.success) throw new Error("The design settings are invalid.");
    if (settings && !settings.success) throw new Error("The form settings are invalid.");
    if (!await repository.saveDraft(user.id, { formId: input.formId, revision: input.revision, schema,
      theme: theme?.success ? theme.data : undefined, settings: settings?.success ? settings.data : undefined })) {
      throw new Error("This draft changed elsewhere or you no longer have edit access. Reload before saving again.");
    }
    return { revision: input.revision + 1 };
  });
}
export async function renameForm(input: { formId: string; title: string }) {
  return handle(async () => {
    const user = await actor();
    const title = input.title.trim().slice(0, 200);
    if (!title) throw new Error("Enter a form name.");
    if (!await repository.renameForm(user.id, input.formId, title)) throw new Error("Form not found or you do not have edit access.");
    return {};
  });
}
export async function duplicateForm(input: { formId: string }) {
  return handle(async () => {
    const user = await actor();
    const source = await repository.readForm(user.id, input.formId, "editor");
    if (!source) throw new Error("Form not found or you do not have edit access.");
    const schema = { ...checkedSchema(source.draft_schema), title: `${source.title} (copy)`.slice(0, 200) };
    return { id: await repository.insertForm(user.id, source.workspace_id, schema, source.theme, source.settings) };
  });
}
export async function changeStatus(formId: string, status: "draft" | "archived" | "closed") {
  return handle(async () => {
    const user = await actor();
    if (!await repository.changeFormStatus(user.id, formId, status)) throw new Error("Form not found or you do not have edit access.");
    return {};
  });
}
export async function getFormForOwner(formId: string): Promise<{ form: OwnerForm } | { error: string }> {
  const result = await handle(async () => {
    const user = await actor();
    const form = await repository.readForm(user.id, formId);
    if (!form) throw new Error("Form not found.");
    return { form };
  });
  return result.ok ? { form: result.form } : { error: result.error };
}
export async function publishForm(input: { formId: string }) {
  return handle(async () => {
    const user = await actor();
    const form = await repository.readForm(user.id, input.formId, "editor");
    if (!form) throw new Error("Form not found or you do not have edit access.");
    const schema = { ...checkedSchema(form.draft_schema), title: form.title };
    if (!schema.blocks.some(b => !["welcome", "statement", "thank_you"].includes(b.type))) throw new Error("Add at least one question before publishing.");
    const plan = await readWorkspacePlan(user.id, form.workspace_id);
    const entitlements = PLANS[plan].entitlements;
    if (!entitlements.customThemes) {
      const reason = themeRequiresPaidPlan(form.theme);
      if (reason) throw new Error(`${reason} Upgrade to Starter or pick a preset.`);
    }
    if (!entitlements.paymentCollection && schema.blocks.some(b => b.type === "payment")) throw new Error("Payment collection requires Starter or Pro.");
    if (!entitlements.emailNotifications && ((form.settings.notifyEmails?.length ?? 0) > 0 || form.settings.responderEnabled)) throw new Error("Email notifications require Starter or Pro.");
    const version = await repository.publishForm(user.id, { formId: input.formId, schema, theme: form.theme, settings: form.settings, maxActive: entitlements.maxActiveForms });
    return { url: `${getAppUrl()}/f/${form.slug}`, version: version.version_number };
  });
}
