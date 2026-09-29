"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Sheet } from "lucide-react";
import { createWebhook } from "@/lib/forms/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

/**
 * Apps Script that appends each response to the sheet it's bound to. Columns
 * are the form's question titles (from `data.fields`); new questions add new
 * columns. Retries are skipped by Response ID, and values that would be read
 * as formulas are stored as text.
 */
const APPS_SCRIPT = `// SOYL Forms → Google Sheets
function doPost(e) {
  var data = JSON.parse(e.postData.contents).data || {};
  if (data.submissionId === "test") return ContentService.createTextOutput("ok");

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var fields = data.fields || [];
    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    ["Response ID", "Submitted at"].concat(fields.map(function (f) { return f.label; }))
      .forEach(function (h) { if (headers.indexOf(h) === -1) headers.push(h); });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sheet.setFrozenRows(1);

    var idCol = headers.indexOf("Response ID") + 1;
    if (sheet.getLastRow() > 1) {
      var seen = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1)
        .createTextFinder(data.submissionId).matchEntireCell(true).findNext();
      if (seen) return ContentService.createTextOutput("ok");
    }

    var values = { "Response ID": data.submissionId, "Submitted at": new Date(data.submittedAt) };
    fields.forEach(function (f) {
      values[f.label] = /^[=+\\-@]/.test(f.value) ? "'" + f.value : f.value;
    });
    sheet.appendRow(headers.map(function (h) { return h in values ? values[h] : ""; }));
    return ContentService.createTextOutput("ok");
  } finally {
    lock.releaseLock();
  }
}
`;

export function isGoogleSheetsUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "script.google.com";
  } catch {
    return false;
  }
}

export function GoogleSheetsConnect({ formId, connected }: { formId: string; connected: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code block is selectable */
    }
  }

  function connect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isGoogleSheetsUrl(url.trim())) {
      setError("Paste the Web app URL from Apps Script. It starts with https://script.google.com/.");
      return;
    }
    start(async () => {
      const res = await createWebhook({ formId, url: url.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl("");
      setDone(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0f9d58]/10 text-[#0f9d58]">
          <Sheet className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-xl tracking-tight">Google Sheets</h2>
          <p className="mt-0.5 text-sm text-ink-soft">Add every new response to a Google Sheet automatically.</p>
        </div>
      </div>

      {done && (
        <Notice tone="positive" className="mt-5">
          Connected. New responses will appear in your sheet within a few minutes.
        </Notice>
      )}

      {connected && !done ? (
        <p className="mt-5 text-sm text-ink-soft">This form is connected to a Google Sheet. You can pause or remove it below.</p>
      ) : (
        !done && (
          <ol className="mt-5 space-y-5 text-sm">
            <Step n={1} title="Create a new Google Sheet">
              <ButtonLink href="https://sheets.new" target="_blank" rel="noreferrer" variant="secondary" size="sm" className="mt-2">
                Open a blank sheet <ExternalLink className="h-3.5 w-3.5" />
              </ButtonLink>
            </Step>
            <Step n={2} title="Add the script">
              <p className="text-ink-soft">
                In the sheet, open <strong>Extensions → Apps Script</strong>, replace the code there with this script, and click <strong>Save</strong>.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={copyScript}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy script"}
                </Button>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-ink-faint hover:text-ink">Show script</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-line bg-paper-deep/40 p-3 font-mono text-[11px] leading-relaxed">
                  {APPS_SCRIPT}
                </pre>
              </details>
            </Step>
            <Step n={3} title="Deploy it as a web app">
              <p className="text-ink-soft">
                Click <strong>Deploy → New deployment</strong>, choose type <strong>Web app</strong>, set <strong>Who has access</strong> to{" "}
                <strong>Anyone</strong>, then <strong>Deploy</strong>. Allow access when Google asks, and copy the <strong>Web app URL</strong>.
              </p>
            </Step>
            <Step n={4} title="Paste the URL here">
              <form onSubmit={connect} className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/…/exec"
                  aria-label="Apps Script web app URL"
                  className="min-w-0 flex-1 !py-2.5"
                />
                <Button type="submit" variant="accent" disabled={pending || !url.trim()}>
                  {pending ? "Connecting…" : "Connect"}
                </Button>
              </form>
              {error && (
                <Notice tone="danger" className="mt-3">
                  {error}
                </Notice>
              )}
            </Step>
          </ol>
        )
      )}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-background">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}
