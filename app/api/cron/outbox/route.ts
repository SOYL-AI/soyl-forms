import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { deliverToWebhook, type DeliveryEvent } from "@/lib/webhooks/deliver";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Outbox worker — drain `form.submission.completed` events with bounded
 * exponential backoff (2^n minutes, max 5 attempts). Trigger via Cloudflare
 * Cron Triggers or any scheduler hitting this route with CRON_SECRET.
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; scheduler disabled." },
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

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
  for (const evt of (events ?? []) as Array<{
    id: string;
    workspace_id: string;
    payload: { submissionId?: string; formId?: string };
    attempts: number;
  }>) {
    await admin.from("outbox_events").update({ status: "processing" }).eq("id", evt.id);

    const { data: sub } = await admin
      .from("submissions")
      .select("id, form_id, submitted_at, answers")
      .eq("id", evt.payload.submissionId ?? "")
      .maybeSingle();
    const submission = sub as {
      id: string;
      form_id: string;
      submitted_at: string;
      answers: unknown;
    } | null;

    const { data: hooks } = submission
      ? await admin
          .from("webhooks")
          .select("id")
          .eq("form_id", submission.form_id)
          .eq("is_active", true)
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

    if (ok) {
      await admin
        .from("outbox_events")
        .update({ status: "completed", processed_at: new Date().toISOString() })
        .eq("id", evt.id);
      delivered += 1;
    } else {
      const attempts = evt.attempts + 1;
      if (attempts >= 5) {
        await admin
          .from("outbox_events")
          .update({ status: "failed", attempts, processed_at: new Date().toISOString() })
          .eq("id", evt.id);
        failed += 1;
      } else {
        const backoffMin = Math.min(2 ** attempts, 120);
        await admin
          .from("outbox_events")
          .update({
            status: "pending",
            attempts,
            available_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
          })
          .eq("id", evt.id);
      }
    }
  }

  return NextResponse.json({ ok: true, delivered, failed });
}
