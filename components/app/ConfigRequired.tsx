import Link from "next/link";
import { Notice } from "@/components/ui/notice";

/** Shown when the backend isn't reachable: pages render, features wait. */
export function ConfigRequired({ area }: { area: string }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display text-3xl tracking-tight">Temporarily unavailable</h1>
      <Notice tone="warn" className="mt-6">
        We can&apos;t load {area} right now. Please try again in a few minutes.
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
