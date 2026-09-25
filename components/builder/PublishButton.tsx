"use client";

import { useState } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { publishForm } from "@/lib/forms/actions";
import { Button } from "@/components/ui/button";

export function PublishButton({
  formId,
  published,
  onBeforePublish,
  onPublished,
}: {
  formId: string;
  published: boolean;
  /** Flush in-flight builder edits first; return false to abort publishing. */
  onBeforePublish?: () => Promise<boolean>;
  onPublished: (result: { url: string; version: number }) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPublish() {
    setWorking(true);
    setError(null);
    if (onBeforePublish) {
      const flushed = await onBeforePublish();
      if (!flushed) {
        setWorking(false);
        return;
      }
    }
    const res = await publishForm({ formId });
    setWorking(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onPublished({ url: res.url, version: res.version });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="accent" onClick={onPublish} disabled={working}>
        <Rocket className="h-4 w-4" />
        {working ? "Publishing…" : published ? "Publish changes" : "Publish"}
      </Button>
      {error && (
        <span role="alert" className="max-w-xs text-xs font-medium text-danger">
          {error}{" "}
          {/upgrade|plan/i.test(error) && (
            <Link href="/billing" className="underline">
              See plans
            </Link>
          )}
        </span>
      )}
    </div>
  );
}
