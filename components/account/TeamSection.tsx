"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, UserPlus } from "lucide-react";
import { canManageTeam, MEMBER_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type MemberRole } from "@/lib/teams";
import {
  changeMemberRole,
  inviteMember,
  leaveWorkspace,
  listTeam,
  removeMember,
  revokeInvite,
  type TeamInvite,
  type TeamMember,
} from "@/lib/team-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

function RoleBadge({ role }: { role: MemberRole }) {
  return (
    <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
      {ROLE_LABELS[role]}
    </span>
  );
}

export function TeamSection({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<{ link: string; emailed: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await listTeam(workspaceId);
    if (res.ok) {
      setMembers(res.members);
      setInvites(res.invites);
      setMyRole(res.myRole);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else await load();
    } finally {
      setBusy(null);
    }
  }

  const manager = canManageTeam(myRole);
  const invitableRoles = MEMBER_ROLES.filter((r) => (myRole === "owner" ? true : r === "viewer" || r === "editor"));

  return (
    <Card>
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-ink-faint" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Team</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {manager
          ? "Invite people to this workspace. Editors change forms and responses; viewers can only read."
          : "Everyone with access to this workspace."}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {members === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName ?? m.email ?? "Unknown person"}
                  {m.isSelf && <span className="ml-1.5 text-xs font-normal text-ink-faint">(you)</span>}
                </p>
                {m.displayName && m.email && <p className="truncate text-xs text-ink-faint">{m.email}</p>}
              </div>
              {manager && !m.isSelf ? (
                <Select
                  aria-label={`Role for ${m.email ?? m.userId}`}
                  value={m.role}
                  disabled={busy !== null}
                  onChange={(e) => run(`role-${m.userId}`, () => changeMemberRole({ workspaceId, userId: m.userId, role: e.target.value as MemberRole }))}
                  title={ROLE_DESCRIPTIONS[m.role]}
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r} disabled={myRole === "admin" && (r === "owner" || r === "admin")}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              ) : (
                <RoleBadge role={m.role} />
              )}
              {manager && !m.isSelf && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.email ?? "this person"} from the workspace?`)) {
                      run(`rm-${m.userId}`, () => removeMember({ workspaceId, userId: m.userId }));
                    }
                  }}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {manager && (
        <div className="mt-4 border-t border-line pt-4">
          <Field label="Invite by email">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                value={email}
                placeholder="teammate@company.com"
                maxLength={200}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select aria-label="Invite role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                {invitableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
              <Button
                disabled={busy !== null || email.trim() === ""}
                onClick={async () => {
                  setBusy("invite");
                  setError(null);
                  setLastLink(null);
                  try {
                    const res = await inviteMember({ workspaceId, email, role });
                    if (!res.ok) setError(res.error);
                    else {
                      setLastLink({ link: res.link, emailed: res.emailed });
                      setEmail("");
                      await load();
                    }
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "invite" ? "Sending…" : "Invite"}
              </Button>
            </div>
          </Field>
          {lastLink && (
            <p className="mt-2 rounded-xl bg-positive-soft px-3 py-2 text-sm text-positive">
              Invite ready{lastLink.emailed ? " — email sent" : ", email isn't configured so share the link"}:{" "}
              <button
                type="button"
                className="font-mono text-xs underline underline-offset-2"
                onClick={() => navigator.clipboard?.writeText(lastLink.link).catch(() => {})}
              >
                copy link
              </button>
            </p>
          )}
          {invites.length > 0 && (
            <ul className="mt-3 space-y-2">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-paper-deep/50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                  <RoleBadge role={inv.role} />
                  <span className="text-xs text-ink-faint">
                    expires {new Date(inv.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <button
                    type="button"
                    title="Copy invite link"
                    onClick={() => navigator.clipboard?.writeText(inv.link).catch(() => {})}
                    className="rounded-full p-1.5 text-ink-soft hover:bg-ink/5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`rev-${inv.id}`, () => revokeInvite({ workspaceId, inviteId: inv.id }))}
                    className="rounded-full px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-ink/5 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (window.confirm("Leave this workspace? You'll lose access to its forms and responses.")) {
              run("leave", async () => {
                const res = await leaveWorkspace({ workspaceId });
                if (res.ok) router.refresh();
                return res;
              });
            }
          }}
          className="text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
        >
          Leave workspace
        </button>
      </div>
    </Card>
  );
}
