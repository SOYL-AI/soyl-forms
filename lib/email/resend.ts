/**
 * Transactional email via Resend's HTTP API. Used for owner notifications on
 * new responses. Fail-soft: callers treat a false return as "not sent".
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(args: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
  from?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "Email isn't configured." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
        ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: args.from ?? process.env.EMAIL_FROM,
        to: args.to.slice(0, 5),
        subject: args.subject.slice(0, 200),
        html: args.html,
        text: args.text,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Network error." };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Replace `{{form_title}}` in a creator template (case-insensitive). */
export function renderResponderTemplate(template: string, formTitle: string): string {
  return template.replace(/{{\s*form_title\s*}}/gi, formTitle);
}

/**
 * Find the autoresponder recipient: the preferred email question when it
 * holds a valid address, otherwise the first answered email question.
 */
export function resolveResponderRecipient(
  blocks: Array<{ id: string; type: string }>,
  answers: Record<string, { type: string; value: unknown }>,
  questionId?: string,
): string | null {
  const validOn = (id: string): string | null => {
    const a = answers[id];
    if (a && a.type === "email" && typeof a.value === "string") {
      const v = a.value.trim();
      if (EMAIL_RE.test(v)) return v;
    }
    return null;
  };
  if (questionId) {
    const preferred = blocks.find((b) => b.id === questionId && b.type === "email");
    if (preferred) return validOn(preferred.id);
    return null;
  }
  for (const b of blocks) {
    if (b.type !== "email") continue;
    const v = validOn(b.id);
    if (v) return v;
  }
  return null;
}

/** Respondent confirmation email: custom message on top, their answers below. */
export function confirmationEmail(args: {
  formTitle: string;
  subject?: string;
  message?: string;
  rows: Array<{ question: string; answer: string }>;
  productName: string;
}): { subject: string; html: string; text: string } {
  const custom = args.message?.trim();
  const body = custom
    ? renderResponderTemplate(custom, args.formTitle)
    : `We received your response to ${args.formTitle}. A copy of your answers is below.`;
  const subject = args.subject?.trim()
    ? renderResponderTemplate(args.subject.trim(), args.formTitle).slice(0, 200)
    : `Thanks for your response \u00b7 ${args.formTitle}`;
  const paragraphs = body
    .split(/\n{2,}|\n/)
    .map((par) => par.trim())
    .filter(Boolean);
  const text = [
    subject,
    "",
    ...paragraphs,
    "",
    ...args.rows.map((r) => `${r.question}\n  ${r.answer || "\u2014"}`),
    "",
    `Sent by ${args.productName}.`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f1;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#101012">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid rgba(16,16,18,.1);border-radius:16px;padding:28px">
    <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8e8b84">Response received</p>
    <h1 style="margin:6px 0 4px;font-size:22px;letter-spacing:-.01em">${escapeHtml(args.formTitle)}</h1>
    ${paragraphs.map((par) => `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#33322f">${escapeHtml(par)}</p>`).join("")}
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:20px">
      ${args.rows
        .map(
          (r) => `<tr><td style="padding:10px 0;border-top:1px solid rgba(16,16,18,.08);vertical-align:top;color:#55534e;width:42%">${escapeHtml(r.question)}</td><td style="padding:10px 0 10px 12px;border-top:1px solid rgba(16,16,18,.08);vertical-align:top;white-space:pre-wrap">${escapeHtml(r.answer || "\u2014")}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#8e8b84">Sent by ${escapeHtml(args.productName)}.</p>
  </div></body></html>`;
  return { subject, html, text };
}

/** Plain, readable notification for a new response. */
export function responseEmail(args: {
  formTitle: string;
  submittedAt: string;
  rows: Array<{ question: string; answer: string }>;
  responseUrl: string;
  productName: string;
}): { subject: string; html: string; text: string } {
  const when = new Date(args.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const subject = `New response · ${args.formTitle}`;
  const text = [
    `${args.formTitle} — new response (${when})`,
    "",
    ...args.rows.map((r) => `${r.question}\n  ${r.answer || "—"}`),
    "",
    `Open: ${args.responseUrl}`,
    "",
    `Sent by ${args.productName}. Turn notifications off in the form's Settings tab.`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f1;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#101012">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid rgba(16,16,18,.1);border-radius:16px;padding:28px">
    <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8e8b84">New response</p>
    <h1 style="margin:6px 0 4px;font-size:22px;letter-spacing:-.01em">${escapeHtml(args.formTitle)}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#55534e">${escapeHtml(when)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${args.rows
        .map(
          (r) => `<tr><td style="padding:10px 0;border-top:1px solid rgba(16,16,18,.08);vertical-align:top;color:#55534e;width:42%">${escapeHtml(r.question)}</td><td style="padding:10px 0 10px 12px;border-top:1px solid rgba(16,16,18,.08);vertical-align:top;white-space:pre-wrap">${escapeHtml(r.answer || "—")}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="margin:24px 0 0"><a href="${escapeHtml(args.responseUrl)}" style="display:inline-block;background:#101012;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:999px">Open response</a></p>
    <p style="margin:20px 0 0;font-size:12px;color:#8e8b84">Sent by ${escapeHtml(args.productName)}. Turn notifications off in the form's Settings tab.</p>
  </div></body></html>`;
  return { subject, html, text };
}
