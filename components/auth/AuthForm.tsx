"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { PLANS, isPlanCode } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

/**
 * Where to send someone after auth. Pricing CTAs pass ?plan=&interval= so
 * the very next screen is checkout; template CTAs pass ?template=.
 */
export function resolveNext(params: URLSearchParams): string {
  const explicit = params.get("next");
  if (explicit && explicit.startsWith("/") && !explicit.startsWith("//")) return explicit;
  const plan = params.get("plan");
  if (plan && isPlanCode(plan) && plan !== "free") {
    const interval = params.get("interval") === "yearly" ? "yearly" : "monthly";
    return `/billing?plan=${plan}&interval=${interval}&checkout=1`;
  }
  const template = params.get("template");
  if (template && /^[a-z0-9-]{1,60}$/.test(template)) return `/templates/${template}?use=1`;
  return "/dashboard";
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = useMemo(() => resolveNext(params), [params]);
  const plan = params.get("plan");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const configured = isSupabaseConfigured();

  async function withGoogle() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setError(null);
    setBusy("google");
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (e) {
      setError(e.message.includes("provider") ? "Google sign-in isn't enabled yet. Use email for now." : e.message);
      setBusy(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Sign-in isn't wired up yet — the app owner needs to set Supabase credentials.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    setBusy("email");
    if (mode === "login") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(null);
      if (authError) {
        setError(authError.message === "Invalid login credentials" ? "That email and password don't match." : authError.message);
        return;
      }
    } else {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      setBusy(null);
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.session) {
        setCheckEmail(true);
        return;
      }
    }
    router.push(next);
    router.refresh();
  }

  if (checkEmail) {
    return (
      <Notice tone="positive" title="Check your inbox">
        We sent a confirmation link to <strong>{email}</strong>. Open it and you&apos;ll land right where you left off
        {plan && isPlanCode(plan) && plan !== "free" ? ` — at ${PLANS[plan].name} checkout` : ""}.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {plan && isPlanCode(plan) && plan !== "free" && (
        <Notice tone="info">
          You picked <strong>{PLANS[plan].name}</strong>. Create your account and checkout opens next — you can still start on Free.
        </Notice>
      )}
      {!configured && (
        <Notice tone="warn">
          Auth isn&apos;t configured in this environment. The page renders, but sign-in is disabled until Supabase keys are set.
        </Notice>
      )}
      <Button type="button" variant="secondary" size="lg" onClick={withGoogle} disabled={!configured || busy !== null}>
        {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="!py-3 text-base" />
        </Field>
        <Field
          label={
            mode === "login" ? (
              <span className="flex items-center justify-between">
                Password
                <Link href="/forgot" className="font-normal text-ink-faint hover:text-ink">
                  Forgot?
                </Link>
              </span>
            ) : (
              "Password"
            )
          }
          htmlFor="password"
          hint={mode === "signup" ? "At least 8 characters." : undefined}
        >
          <Input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="!py-3 text-base"
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="accent" size="lg" disabled={busy !== null || !configured}>
          {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {busy === "email" ? (mode === "login" ? "Logging in…" : "Creating account…") : mode === "login" ? "Log in" : "Create free account"}
        </Button>
      </form>
      <p className="text-sm text-ink-soft">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={`${mode === "login" ? "/signup" : "/login"}${params.toString() ? `?${params.toString()}` : ""}`} className="font-semibold text-ink underline underline-offset-2">
          {mode === "login" ? "Create an account" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
