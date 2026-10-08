import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { deliverToWebhook, type DeliveryEvent } from "@/lib/webhooks/deliver";
import { formSchemaV1, formSettingsSchema } from "@/lib/forms/schema";
import { displayAnswer } from "@/lib/forms/answers";
import { submissionFields } from "@/lib/forms/csv";
import { recallText } from "@/lib/forms/recall";
import { isAnswerable } from "@/lib/forms/logic";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/plans";
import { confirmationEmail, isEmailConfigured, resolveResponderRecipient, responseEmail } from "@/lib/email/resend";
import { getAppUrl, getProductName } from "@/lib/config";
import { deliverEmail } from "@/lib/email/deliver";
import type { AnswerValue } from "@/types/forms";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Admin = NonNullable<ReturnType<typeof getServiceSupabase>>;

/**
 * Owner email notification for one submission. Best-effort: plan-gated,
 * atomically quota-reserved and retried with a stable provider idempotency key.
 */
async function notifyOwners(
  admin: Admin,
  submission: { id: string; form_id: string; submitted_at: string; answers: unknown; form_version_id: string },
  workspaceId: string,
  eventId: string,
): Promise<"sent" | "skipped" | "failed" | "uncertain"> {
  const { data: form } = await admin.from("form_versions").select("schema, settings").eq("id", submission.form_version_id).maybeSingle();
  const settings = formSettingsSchema.safeParse((form as { settings: unknown } | null)?.settings ?? {});
  const recipients = settings.success ? settings.data.notifyEmails ?? [] : [];
  if (recipients.length === 0) return "skipped";

  const plan = await getWorkspacePlan(workspaceId);
  const ent = PLANS[plan].entitlements;
  if (!ent.emailNotifications) return "skipped";
  if (!isEmailConfigured()) return "failed";

  const { data: version } = await admin.from("form_versions").select("schema").eq("id", submission.form_version_id).maybeSingle();
  const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
  const answers = (submission.answers ?? {}) as Record<string, AnswerValue>;
  const rows = parsed.success
    ? parsed.data.blocks.filter((b) => isAnswerable(b.type)).map((b) => ({ question: recallText(b.title, parsed.data.blocks, answers), answer: displayAnswer(b, answers[b.id]) }))
    : Object.entries(answers).map(([k, v]) => ({ question: k, answer: typeof v.value === "string" ? v.value : JSON.stringify(v.value) }));

  const mail = responseEmail({
    formTitle: (form as { schema: { title?: string } } | null)?.schema?.title ?? "Your form",
    submittedAt: submission.submitted_at,
    rows,
    responseUrl: `${getAppUrl()}/forms/${submission.form_id}/responses/${submission.id}`,
    productName: getProductName(),
  });
  return deliverEmail(`${eventId}:owners`, workspaceId, ent.monthlyNotificationEmails, { to: recipients, ...mail });
}

/**
 * Respondent confirmation email (autoresponder). Opt-in per form: the
 * recipient is the preferred email question when answered, else the first
 * answered email question. Shares the plan gate and monthly email pool with
 * owner notifications. Never retried — a missed confirmation must not block
 * or re-fire webhooks.
 */
async function notifyRespondent(
  admin: Admin,
  submission: { id: string; form_id: string; submitted_at: string; answers: unknown; form_version_id: string },
  workspaceId: string,
  eventId: string,
): Promise<"sent" | "skipped" | "failed" | "uncertain"> {
  const { data: form } = await admin.from("form_versions").select("schema, settings").eq("id", submission.form_version_id).maybeSingle();
  const settings = formSettingsSchema.safeParse((form as { settings: unknown } | null)?.settings ?? {});
  if (!settings.success || settings.data.responderEnabled !== true) return "skipped";

  const plan = await getWorkspacePlan(workspaceId);
  const ent = PLANS[plan].entitlements;
  if (!ent.emailNotifications) return "skipped";
  if (!isEmailConfigured()) return "failed";

  const { data: version } = await admin.from("form_versions").select("schema").eq("id", submission.form_version_id).maybeSingle();
  const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
  if (!parsed.success) return "skipped";
  const answers = (submission.answers ?? {}) as Record<string, AnswerValue>;
  const to = resolveResponderRecipient(parsed.data.blocks, answers, settings.data.responderQuestionId);
  if (!to) return "skipped";

  const rows = parsed.data.blocks
    .filter((b) => isAnswerable(b.type))
    .map((b) => ({ question: recallText(b.title, parsed.data.blocks, answers), answer: displayAnswer(b, answers[b.id]) }));
  const mail = confirmationEmail({
    formTitle: (form as { schema: { title?: string } } | null)?.schema?.title ?? "Your form",
    subject: settings.data.responderSubject,
    message: settings.data.responderMessage,
    rows,
    productName: getProductName(),
  });
  return deliverEmail(`${eventId}:respondent`, workspaceId, ent.monthlyNotificationEmails, { to: [to], ...mail, replyTo: settings.data.notifyEmails?.[0] });
}

/**
 * Outbox worker — drain `form.submission.completed` events: deliver to
 * webhooks with bounded exponential backoff (2^n minutes, max 5 attempts)
 * and send owner notifications. Trigger via Cloudflare Cron Triggers or any
 * scheduler hitting this route with CRON_SECRET.
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured; scheduler disabled." }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

  let delivered = 0;
  let failed = 0;
  let emails = 0;
  const started = Date.now();
  for (let i = 0; i < 25 && Date.now() - started < 30_000; i++) {
    const { data: claimed, error: claimError } = await admin.rpc("claim_outbox_event");
    if (claimError) return NextResponse.json({ error: "Couldn't claim queued events." }, { status: 503 });
    const evt = claimed?.[0] as { id: string; workspace_id: string; attempts: number; lease_token: string;
      payload: { submissionId?: string; formId?: string; owners?: boolean; respondent?: boolean; hooks?: string[]; notified?: boolean } } | undefined;
    if (!evt) break;
    const payload = { ...evt.payload, hooks: [...(evt.payload.hooks ?? [])] };
    // Migrate legacy email bookkeeping without resending already attempted emails.
    if (payload.notified) { payload.owners = true; payload.respondent = true; }
    async function checkpoint() {
      const { data, error } = await admin!.from("outbox_events")
        .update({ payload, lease_until: new Date(Date.now() + 120_000).toISOString() })
        .eq("id", evt!.id).eq("status", "processing").eq("lease_token", evt!.lease_token)
        .gt("lease_until", new Date().toISOString()).select("id");
      if (error || !data?.length) throw new Error("Outbox lease lost.");
    }
    let ok = true;
    let uncertain = false;
    try {
      const { data: submission, error: subError } = await admin.from("submissions")
        .select("id, form_id, form_version_id, submitted_at, answers, deleted_at").eq("id", payload.submissionId ?? "").maybeSingle();
      if (subError) throw new Error("Couldn't load response.");
      if (submission && !submission.deleted_at) {
        if (!payload.owners) {
          await checkpoint();
          const outcome = await notifyOwners(admin, submission, evt.workspace_id, evt.id);
          if (outcome === "sent") emails++;
          if (outcome === "failed") ok = false;
          else if (outcome === "uncertain") { ok = false; uncertain = true; }
          else { payload.owners = true; await checkpoint(); }
        }
        if (!payload.respondent) {
          await checkpoint();
          const outcome = await notifyRespondent(admin, submission, evt.workspace_id, evt.id);
          if (outcome === "sent") emails++;
          if (outcome === "failed") ok = false;
          else if (outcome === "uncertain") { ok = false; uncertain = true; }
          else { payload.respondent = true; await checkpoint(); }
        }
        const { data: hooks, error: hookError } = await admin.from("webhooks").select("id")
          .eq("form_id", submission.form_id).eq("is_active", true);
        if (hookError) throw new Error("Couldn't load destinations.");
        const { data: version, error: versionError } = await admin.from("form_versions").select("schema")
          .eq("id", submission.form_version_id).maybeSingle();
        if (versionError) throw new Error("Couldn't load published version.");
        const schema = formSchemaV1.safeParse(version?.schema);
        const event: DeliveryEvent = { eventId: evt.id, formId: submission.form_id, submissionId: submission.id,
          submittedAt: submission.submitted_at, answers: submission.answers,
          fields: schema.success ? submissionFields(schema.data.blocks, submission.answers as Record<string, AnswerValue>) : undefined };
        for (const hook of hooks ?? []) {
          if (payload.hooks.includes(hook.id)) continue;
          await checkpoint();
          const { data: previous, error: previousError } = await admin.from("webhook_deliveries").select("id")
            .eq("webhook_id", hook.id).eq("event_id", evt.id).not("delivered_at", "is", null).limit(1);
          if (previousError) throw new Error("Couldn't read delivery state.");
          if (!previous?.length && !(await deliverToWebhook(hook.id, event, evt.attempts)).ok) { ok = false; continue; }
          payload.hooks.push(hook.id);
          await checkpoint();
        }
      }
    } catch {
      ok = false;
      console.error("[outbox] event processing failed", { eventId: evt.id });
    }
    const terminal = !ok && (evt.attempts >= 5 || uncertain);
    const { error: finishError } = await admin.from("outbox_events").update({
      payload, status: ok ? "completed" : terminal ? "failed" : "pending",
      lease_token: null, lease_until: null,
      processed_at: ok || terminal ? new Date().toISOString() : null,
      available_at: new Date(Date.now() + Math.min(2 ** evt.attempts, 120) * 60_000).toISOString(),
    }).eq("id", evt.id).eq("lease_token", evt.lease_token).gt("lease_until", new Date().toISOString());
    if (finishError) console.error("[outbox] checkpoint failed", { eventId: evt.id });
    if (ok) delivered++; else if (terminal) failed++;
  }
  return NextResponse.json({ ok: true, delivered, failed, emails });
}
