"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/marketing/site-header";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getProductName } from "@/lib/config";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError(
        "Sign-up isn't wired up yet — the app owner needs to set Supabase credentials (see README).",
      );
      return;
    }
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 pb-20 pt-14">
        <h1 className="font-display text-3xl tracking-tight">Create your account</h1>
        <p className="mt-2 text-ink-soft">
          Free for 2 live forms. No card. Your first form is minutes away.
        </p>
        {!configured && (
          <p role="note" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Auth backend not configured in this environment. Pages render, but
            sign-up is disabled until Supabase keys are set.
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-semibold">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-semibold">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
            <p className="mt-1.5 text-xs text-ink-faint">At least 8 characters.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Creating account…" : "Sign up free"}
          </button>
        </form>
        <p className="mt-5 text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            Log in
          </Link>
        </p>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Signing up creates your personal workspace — {getProductName()} never
          asks for billing details to try the free plan.
        </p>
      </main>
    </div>
  );
}
