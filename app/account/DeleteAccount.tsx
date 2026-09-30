"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "@/lib/account/delete";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirmed = confirmation.trim().toUpperCase() === "DELETE";

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirmation("");
    setError(null);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description="This permanently deletes your account, your workspace, every form, all responses and uploaded files, and your brand kits. Any paid plan is cancelled. This can't be undone."
        size="sm"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirmed) return;
            setError(null);
            start(async () => {
              const res = await deleteMyAccount({ confirmation });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              window.location.assign("/delete-account?done=1");
            });
          }}
        >
          <Field label="Type DELETE to confirm" htmlFor="delete-confirm">
            <Input
              id="delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={pending}
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!confirmed || pending}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
