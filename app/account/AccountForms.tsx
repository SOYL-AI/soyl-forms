"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameWorkspace, signOut, updateProfile } from "@/lib/auth/actions";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

export function AccountForms({
  email,
  displayName,
  workspaceId,
  workspaceName,
  showPassword,
}: {
  email: string | null;
  displayName: string | null;
  workspaceId: string;
  workspaceName: string;
  showPassword?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName ?? "");
  const [ws, setWs] = useState(workspaceName);
  const [password, setPassword] = useState("");
  const [pwOpen, setPwOpen] = useState(Boolean(showPassword));
  const [msg, setMsg] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { tone: "positive", text: ok } : { tone: "danger", text: res.error ?? "Something went wrong." });
      if (res.ok) router.refresh();
    });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    if (password.length < 8) {
      setMsg({ tone: "danger", text: "Choose a password with at least 8 characters." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setMsg(error ? { tone: "danger", text: error.message } : { tone: "positive", text: "Password updated." });
    if (!error) {
      setPassword("");
      setPwOpen(false);
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateProfile({ displayName: name }), "Profile saved.");
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Profile</p>
        <Field label="Email">
          <Input value={email ?? ""} readOnly disabled />
        </Field>
        <Field label="Display name" htmlFor="display-name">
          <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="How we address you" />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            Save profile
          </Button>
        </div>
      </form>

      <form
        className="flex flex-col gap-3 border-t border-line pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => renameWorkspace({ workspaceId, name: ws }), "Workspace renamed.");
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Workspace</p>
        <Field label="Workspace name" htmlFor="ws-name" hint="Shown in the app header and on emails to you.">
          <Input id="ws-name" value={ws} onChange={(e) => setWs(e.target.value)} maxLength={80} />
        </Field>
        <div>
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            Rename workspace
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Sign-in</p>
        {pwOpen ? (
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <Field label="New password" htmlFor="new-pw" hint="At least 8 characters.">
              <Input id="new-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Update password
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPwOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setPwOpen(true)}>
              Change password
            </Button>
            <form action={signOut}>
              <Button type="submit" size="sm" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        )}
      </div>
    </Card>
  );
}
