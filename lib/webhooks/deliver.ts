import { getServiceSupabase } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/secrets";
import { signWebhook, submissionEventBody } from "./sign";

export interface DeliveryEvent {
  eventId: string;
  formId: string;
  submissionId: string;
  submittedAt: string;
  answers: unknown;
}

/**
 * One delivery attempt to a single webhook. Records the attempt row and
 * returns the outcome; retry/backoff policy lives with the caller (outbox
 * worker). Never throws on provider failure — it reports.
 */
export async function deliverToWebhook(
  webhookId: string,
  event: DeliveryEvent,
  attempt: number,
): Promise<{ ok: boolean; httpStatus: number | null; error?: string }> {
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, httpStatus: null, error: "Server misconfigured." };

  const { data } = await admin
    .from("webhooks")
    .select("id, url, secret_encrypted, is_active")
    .eq("id", webhookId)
    .maybeSingle();
  const hook = data as {
    id: string;
    url: string;
    secret_encrypted: string;
    is_active: boolean;
  } | null;
  if (!hook || !hook.is_active) {
    return { ok: false, httpStatus: null, error: "Webhook missing or inactive." };
  }

  let secret: string;
  try {
    secret = decryptSecret(hook.secret_encrypted);
  } catch {
    return { ok: false, httpStatus: null, error: "Cannot decrypt webhook secret." };
  }

  const body = submissionEventBody(event);
  const signed = signWebhook(secret, body, event.eventId);

  let status: number | null = null;
  let error: string | undefined;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    status = res.status;
    await res.arrayBuffer().catch(() => null);
    if (res.status < 200 || res.status >= 300) {
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : "Network error.";
  }

  await admin.from("webhook_deliveries").insert({
    webhook_id: webhookId,
    event_type: "form.submission.completed",
    event_id: event.eventId,
    attempt,
    http_status: status,
    delivered_at: error ? null : new Date().toISOString(),
    last_error: error ?? null,
  });

  return error ? { ok: false, httpStatus: status, error } : { ok: true, httpStatus: status };
}
