"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeForm, reopenForm } from "@/lib/forms/actions";
import { Button } from "@/components/ui/button";

export function StateActions({ formId, status, canReopen }: { formId: string; status: string; canReopen: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (status === "published") {
    return (
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Close this form? Respondents will see your closed message until you reopen it.")) {
            start(async () => {
              await closeForm({ formId });
              router.refresh();
            });
          }
        }}
      >
        Close form
      </Button>
    );
  }
  if (status === "closed" && canReopen) {
    return (
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await reopenForm({ formId });
            router.refresh();
          })
        }
      >
        Reopen
      </Button>
    );
  }
  return null;
}
