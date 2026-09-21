"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/account?reset=1")}`,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Notice tone="positive" title="Check your inbox">
        If an account exists for <strong>{email}</strong>, a reset link is on its way.
      </Notice>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {!configured && <Notice tone="warn">Auth isn&apos;t configured in this environment.</Notice>}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="!py-3 text-base" />
      </Field>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="accent" size="lg" disabled={busy || !configured}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-sm text-ink-soft">
        <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
