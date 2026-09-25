"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createFormFromTemplate } from "@/lib/forms/actions";
import { Button } from "@/components/ui/button";

/** Creates a form from a template; sends signed-out visitors to sign up with the intent preserved. */
export function UseTemplateButton({
  templateId,
  signedIn,
  size = "sm",
  label = "Use template",
}: {
  templateId: string;
  signedIn: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    if (!signedIn) {
      router.push(`/signup?template=${encodeURIComponent(templateId)}`);
      return;
    }
    setError(null);
    start(async () => {
      const res = await createFormFromTemplate({ templateId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/builder/${res.id}`);
    });
  }

  return (
    <span className="inline-flex flex-col">
      <Button variant="primary" size={size} onClick={go} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {pending ? "Creating…" : label}
      </Button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
