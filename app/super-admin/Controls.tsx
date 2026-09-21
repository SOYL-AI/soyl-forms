"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearPlanOverride, setFormStatus, setPlanOverride, setWorkspaceStatus } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      router.refresh();
    });
  }
  return { run, pending, error, setError };
}

export function WorkspaceStatusButton({ workspaceId, status }: { workspaceId: string; status: string }) {
  const { run, pending, error } = useRun();
  const suspended = status === "suspended";
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant={suspended ? "primary" : "danger"}
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(suspended ? "Reason for reactivating (logged):" : "Reason for suspending (logged). Its forms stop serving immediately:");
          if (reason === null) return;
          run(() => setWorkspaceStatus({ workspaceId, status: suspended ? "active" : "suspended", reason }));
        }}
      >
        {suspended ? "Reactivate" : "Suspend"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function FormStatusButton({ formId, status }: { formId: string; status: string }) {
  const { run, pending, error } = useRun();
  const suspended = status === "closed";
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant={suspended ? "primary" : "danger"}
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(suspended ? "Reason for reactivating (logged):" : "Reason for suspending this form (logged). Its public link stops working:");
          if (reason === null) return;
          run(() => setFormStatus({ formId, suspend: !suspended, reason }));
        }}
      >
        {suspended ? "Reactivate" : "Suspend"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function OverrideForm({ workspaceId, currentPlan, hasOverride }: { workspaceId: string; currentPlan: string; hasOverride: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState(currentPlan);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <details className="rounded-2xl border border-warn/30 bg-warn-soft/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Manual entitlement override {hasOverride ? "(active)" : ""}</summary>
      <p className="mt-1 text-xs text-ink-soft">Grants a plan without payment for a bounded time. Requires a reason and an expiry; everything is audit-logged.</p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr_160px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          start(async () => {
            const res = await setPlanOverride({ workspaceId, plan, reason, expiresAt });
            setMessage(res.ok ? { tone: "positive", text: "Override recorded and audited." } : { tone: "danger", text: res.error });
            if (res.ok) {
              setReason("");
              setExpiresAt("");
              router.refresh();
            }
          });
        }}
      >
        <Field label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLAN_ORDER.map((p) => (
              <option key={p} value={p}>
                {PLANS[p].name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason (required)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Incident #…, goodwill credit, pilot…" />
        </Field>
        <Field label="Expires (required)">
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Apply
          </Button>
          {hasOverride && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await clearPlanOverride({ workspaceId });
                  setMessage(res.ok ? { tone: "positive", text: "Override cleared." } : { tone: "danger", text: res.error });
                  router.refresh();
                })
              }
            >
              Clear
            </Button>
          )}
        </div>
      </form>
      {message && (
        <Notice tone={message.tone} className="mt-3">
          {message.text}
        </Notice>
      )}
    </details>
  );
}

export function SearchForm({ placeholder, defaultValue, action }: { placeholder: string; defaultValue?: string; action?: string }) {
  return (
    <form method="get" action={action} className="flex gap-2">
      <Input type="search" name="q" defaultValue={defaultValue ?? ""} placeholder={placeholder} className="w-full sm:w-96" />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
