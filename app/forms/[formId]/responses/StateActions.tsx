"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeForm, reopenForm } from "@/lib/forms/actions";

export function StateActions({
  formId,
  status,
  canReopen,
}: {
  formId: string;
  status: string;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (status === "published") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Close this form? Respondents will see your closed message.")) {
            start(async () => {
              await closeForm({ formId });
              router.refresh();
            });
          }
        }}
        className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30 disabled:opacity-60"
      >
        Close form
      </button>
    );
  }
  if (status === "closed" && canReopen) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await reopenForm({ formId });
            router.refresh();
          })
        }
        className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        Reopen
      </button>
    );
  }
  return null;
}
