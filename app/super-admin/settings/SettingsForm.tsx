"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlatformFlags } from "@/lib/platform";
import { updatePlatformFlags } from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

export function SettingsForm({ initial, canEdit }: { initial: PlatformFlags; canEdit: boolean }) {
  const router = useRouter();
  const [flags, setFlags] = useState<PlatformFlags>(initial);
  const [msg, setMsg] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const patch = (p: Partial<PlatformFlags>) => setFlags((f) => ({ ...f, ...p }));

  return (
    <Card className="flex flex-col gap-4">
      {!canEdit && <Notice tone="info">Support admins can view these settings; only super admins can change them.</Notice>}
      <Switch checked={flags.registrationsEnabled} onChange={(v) => patch({ registrationsEnabled: v })} disabled={!canEdit} label="New registrations" description="Off: new accounts can sign in but no workspace is provisioned." />
      <Switch checked={flags.uploadsEnabled} onChange={(v) => patch({ uploadsEnabled: v })} disabled={!canEdit} label="File uploads" description="Off: respondent uploads and creator assets are refused (existing files still serve)." />
      <Switch checked={flags.upgradesEnabled} onChange={(v) => patch({ upgradesEnabled: v })} disabled={!canEdit} label="Paid upgrades & credit packs" description="Off: checkout endpoints return 503; existing subscriptions are untouched." />
      <Switch checked={flags.aiEnabled} onChange={(v) => patch({ aiEnabled: v })} disabled={!canEdit} label="AI features" description="Off: drafting and brand extraction pause; no credits are spent." />
      <Field label="Maintenance banner" hint="Shown at the top of the signed-in app when non-empty.">
        <Input value={flags.maintenanceBanner} onChange={(e) => patch({ maintenanceBanner: e.target.value })} disabled={!canEdit} maxLength={300} placeholder="Scheduled maintenance Sunday 02:00–02:30 IST." />
      </Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {canEdit && (
        <div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await updatePlatformFlags({ flags });
                setMsg(res.ok ? { tone: "positive", text: "Settings saved and audited." } : { tone: "danger", text: res.error });
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </Card>
  );
}
