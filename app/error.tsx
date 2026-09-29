"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 py-20 text-center sm:px-6">
      <h1 className="font-display text-[2.5rem] leading-[1.05] tracking-tight sm:text-[3.2rem]">Something went wrong</h1>
      <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
        Please try again. If the problem continues, contact us and we&apos;ll sort it out.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Button variant="accent" size="lg" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/" variant="secondary" size="lg">
          Go home
        </ButtonLink>
      </div>
    </main>
  );
}
