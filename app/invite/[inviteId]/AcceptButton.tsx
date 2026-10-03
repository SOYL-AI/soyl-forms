"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "@/lib/team-actions";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await acceptInvite({ inviteId });
            if (!res.ok) setError(res.error);
            else router.push("/account");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Joining…" : "Accept invite"}
      </Button>
    </div>
  );
}
