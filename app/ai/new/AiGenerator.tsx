"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createForm, saveDraft } from "@/lib/forms/actions";
import { AI_COST_PER_DRAFT } from "@/lib/plans";

export function AiGenerator({ initialBalance }: { initialBalance: number }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [balance, setBalance] = useState(initialBalance);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("Dreaming up your questions…");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        schema?: { title?: string } & Record<string, unknown>;
        logicDropped?: boolean;
        balance?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok || !data.schema) {
        throw new Error(data?.error ?? "Generation failed.");
      }
      if (typeof data.balance === "number") setBalance(data.balance);
      setStatus(
        data.logicDropped
          ? "Draft ready (fancy branching was simplified) — opening your builder…"
          : "Draft ready — opening your builder…",
      );
      const created = await createForm({ title: String(data.schema.title ?? "AI draft") });
      if (!created.ok) throw new Error(created.error);
      const saved = await saveDraft({
        formId: created.id,
        title: String(data.schema.title ?? "AI draft"),
        schema: data.schema,
        revision: 0,
      });
      if (!saved.ok) throw new Error(saved.error);
      router.push(`/builder/${created.id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-paper-deep px-3 py-1 font-semibold">
          {balance} credit{balance === 1 ? "" : "s"}
        </span>
        <span className="text-ink-faint">· {AI_COST_PER_DRAFT} per draft</span>
        <a href="/billing/credits" className="font-semibold text-brand-700 hover:text-brand-900">
          Top up →
        </a>
      </div>
      <form onSubmit={onGenerate} className="mt-5">
        <label htmlFor="ai-desc" className="text-sm font-semibold">
          Describe the form you want
        </label>
        <textarea
          id="ai-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Event registration for a college hackathon: name, email, team size, track preference, dietary needs…"
          className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base leading-relaxed focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>
        )}
        {status && !error && (
          <p role="status" className="mt-3 text-sm text-ink-soft">{status}</p>
        )}
        <button
          type="submit"
          disabled={busy || description.trim().length < 10}
          className="mt-4 rounded-full bg-ink px-7 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate draft"}
        </button>
      </form>
      <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-faint">
        AI drafts always land in your builder for review — nothing publishes
        automatically. 10 free credits every month, plus 10 to start.
      </p>
    </div>
  );
}
