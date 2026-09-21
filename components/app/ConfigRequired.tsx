import Link from "next/link";
import { Notice } from "@/components/ui/notice";

/** Honest state when Supabase isn't configured: pages render, features wait. */
export function ConfigRequired({ area }: { area: string }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Setup</p>
      <h1 className="mt-1 font-display text-3xl tracking-tight">Almost there</h1>
      <Notice tone="warn" title="Backend not configured" className="mt-6">
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and{" "}
        <code>SUPABASE_SERVICE_ROLE_KEY</code>, then run the migrations in <code>supabase/migrations</code>.
        This page becomes {area}.
      </Notice>
      <p className="mt-6 text-sm text-ink-soft">
        Meanwhile,{" "}
        <Link href="/f/demo" className="font-semibold text-ink underline underline-offset-2">
          try the demo form
        </Link>{" "}
        or{" "}
        <Link href="/templates" className="font-semibold text-ink underline underline-offset-2">
          browse templates
        </Link>
        .
      </p>
    </main>
  );
}
