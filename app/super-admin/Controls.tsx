"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearPlanOverride,
  setFormStatus,
  setPlanOverride,
  setWorkspaceStatus,
} from "./actions";

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

export function WorkspaceStatusButton({
  workspaceId,
  status,
}: {
  workspaceId: string;
  status: string;
}) {
  const { run, pending, error } = useRun();
  const suspended = status === "suspended";
  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              suspended
                ? "Reactivate this workspace?"
                : "Suspend this workspace? Its forms stop serving immediately.",
            )
          ) {
            run(() =>
              setWorkspaceStatus({
                workspaceId,
                status: suspended ? "active" : "suspended",
              }),
            );
          }
        }}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
          suspended ? "bg-ink text-white" : "text-red-700 hover:bg-red-50"
        }`}
      >
        {suspended ? "Reactivate" : "Suspend"}
      </button>
      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function FormStatusButton({
  formId,
  status,
}: {
  formId: string;
  status: string;
}) {
  const { run, pending, error } = useRun();
  const suspended = status === "closed";
  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              suspended
                ? "Reactivate this form?"
                : "Suspend this form? Its public link stops working.",
            )
          ) {
            run(() => setFormStatus({ formId, suspend: !suspended }));
          }
        }}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
          suspended ? "bg-ink text-white" : "text-red-700 hover:bg-red-50"
        }`}
      >
        {suspended ? "Reactivate" : "Suspend"}
      </button>
      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function OverrideForm({
  workspaceId,
  currentPlan,
}: {
  workspaceId: string;
  currentPlan: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(currentPlan);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
        Manual entitlement override
      </summary>
      <form
        className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-amber-300 bg-amber-50/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          start(async () => {
            const res = await setPlanOverride({ workspaceId, plan, reason, expiresAt });
            setMessage(res.ok ? "Override recorded + audited." : res.error);
            if (res.ok) {
              setReason("");
              setExpiresAt("");
              router.refresh();
            }
          });
        }}
      >
        <label className="text-xs font-semibold">
          Plan
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="ml-1.5 rounded-lg border border-ink/15 bg-white px-2 py-1.5"
          >
            {["free", "starter", "pro"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Reason (required)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Incident #…, compensation…"
            className="ml-1.5 w-52 rounded-lg border border-ink/15 bg-white px-2 py-1.5 font-normal"
          />
        </label>
        <label className="text-xs font-semibold">
          Expires (required)
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="ml-1.5 rounded-lg border border-ink/15 bg-white px-2 py-1.5 font-normal"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Apply
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await clearPlanOverride({ workspaceId });
              setMessage(res.ok ? "Override cleared." : res.error);
              router.refresh();
            })
          }
          className="rounded-full px-3 py-1.5 text-xs text-ink-soft hover:bg-ink/5 disabled:opacity-60"
        >
          Clear
        </button>
        {message && <p className="w-full text-xs font-medium">{message}</p>}
      </form>
    </details>
  );
}
