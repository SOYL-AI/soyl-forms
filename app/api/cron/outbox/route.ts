import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { deliverToWebhook, type DeliveryEvent } from "@/lib/webhooks/deliver";
import { formSchemaV1, formSettingsSchema } from "@/lib/forms/schema";
import { displayAnswer } from "@/lib/forms/answers";
import { recallText } from "@/lib/forms/recall";
import { isAnswerable } from "@/lib/forms/logic";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/plans";
import { isEmailConfigured, responseEmail, sendEmail } from "@/lib/email/resend";
import { getAppUrl, getProductName } from "@/lib/config";
import type { AnswerValue } from "@/types/forms";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Admin = NonNullable<ReturnType<typeof getServiceSupabase>>;

/**
 * Owner email notification for one submission. Best-effort: plan-gated,
 * monthly-capped via usage_monthly.notification_emails, never retried (a
 * missed email must not block or re-fire webhooks).
 */
async function notifyOwners(
  admin: Admin,
  submission: { id: string; form_id: string; submitted_at: string; answers: unknown; form_version_id: string },
  workspaceId: string,
): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailConfigured()) return "skipped";
  const { data: form } = await admin.from("forms").select("title, settings").eq("id", submission.form_id).maybeSingle();
  const settings = formSettingsSchema.safeParse((form as { settings: unknown } | null)?.settings ?? {});
  const recipients = settings.success ? settings.data.notifyEmails ?? [] : [];
  if (recipients.length === 0) return "skipped";

  const plan = await getWorkspacePlan(workspaceId);
  const ent = PLANS[plan].entitlements;
  if (!ent.emailNotifications) return "skipped";

  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const { data: usage } = await admin.from("usage_monthly").select("notification_emails").eq("workspace_id", workspaceId).eq("month", month).maybeSingle();
  const sent = (usage as { notification_emails: number } | null)?.notification_emails ?? 0;
  if (sent >= ent.monthlyNotificationEmails) return "skipped";

  const { data: version } = await admin.from("form_versions").select("schema").eq("id", submission.form_version_id).maybeSingle();
  const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
  const answers = (submission.answers ?? {}) as Record<string, AnswerValue>;
  const rows = parsed.success
    ? parsed.data.blocks.filter((b) => isAnswerable(b.type)).map((b) => ({ question: recallText(b.title, parsed.data.blocks, answers), answer: displayAnswer(b, answers[b.id]) }))
    : Object.entries(answers).map(([k, v]) => ({ question: k, answer: typeof v.value === "string" ? v.value : JSON.stringify(v.value) }));

  const mail = responseEmail({
    formTitle: (form as { title: string } | null)?.title ?? "Your form",
    submittedAt: submission.submitted_at,
    rows,
    responseUrl: `${getAppUrl()}/forms/${submission.form_id}/responses/${submission.id}`,
    productName: getProductName(),
  });
  const res = await sendEmail({ to: recipients, ...mail });
  if (!res.ok) return "failed";
  await admin
    .from("usage_monthly")
    .upsert({ workspace_id: workspaceId, month, notification_emails: sent + 1, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,month" });
  return "sent";
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

  const { data: events } = await admin
    .from("outbox_events")
    .select("id, workspace_id, payload, attempts")
    .eq("status", "pending")
    .eq("type", "form.submission.completed")
    .lte("available_at", new Date().toISOString())
    .order("available_at", { ascending: true })
    .limit(25);

  let delivered = 0;
  let failed = 0;
  let emails = 0;
  for (const evt of (events ?? []) as Array<{
    id: string;
    workspace_id: string;
    payload: { submissionId?: string; formId?: string; notified?: boolean };
    attempts: number;
  }>) {
    await admin.from("outbox_events").update({ status: "processing" }).eq("id", evt.id);

    const { data: sub } = await admin
      .from("submissions")
      .select("id, form_id, form_version_id, submitted_at, answers")
      .eq("id", evt.payload.submissionId ?? "")
      .maybeSingle();
    const submission = sub as {
      id: string;
      form_id: string;
      form_version_id: string;
      submitted_at: string;
      answers: unknown;
    } | null;

    // Notifications go out on the first attempt only.
    let notified = evt.payload.notified === true;
    if (submission && !notified) {
      const outcome = await notifyOwners(admin, submission, evt.workspace_id);
      if (outcome === "sent") emails += 1;
      notified = true;
    }

    const { data: hooks } = submission
      ? await admin.from("webhooks").select("id").eq("form_id", submission.form_id).eq("is_active", true)
      : { data: null };

    let ok = true;
    if (submission && hooks && hooks.length > 0) {
      const event: DeliveryEvent = {
        eventId: evt.id,
        formId: submission.form_id,
        submissionId: submission.id,
        submittedAt: submission.submitted_at,
        answers: submission.answers,
      };
      for (const h of hooks as Array<{ id: string }>) {
        const res = await deliverToWebhook(h.id, event, evt.attempts + 1);
        if (!res.ok) ok = false;
      }
    }

    const payload = { ...evt.payload, notified };
    if (ok) {
      await admin.from("outbox_events").update({ status: "completed", payload, processed_at: new Date().toISOString() }).eq("id", evt.id);
      delivered += 1;
    } else {
      const attempts = evt.attempts + 1;
      if (attempts >= 5) {
        await admin.from("outbox_events").update({ status: "failed", attempts, payload, processed_at: new Date().toISOString() }).eq("id", evt.id);
        failed += 1;
      } else {
        const backoffMin = Math.min(2 ** attempts, 120);
        await admin
          .from("outbox_events")
          .update({ status: "pending", attempts, payload, available_at: new Date(Date.now() + backoffMin * 60_000).toISOString() })
          .eq("id", evt.id);
      }
    }
  }

  return NextResponse.json({ ok: true, delivered, failed, emails });
}
