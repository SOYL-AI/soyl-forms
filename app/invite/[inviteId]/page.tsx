import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAppContext } from "@/lib/app-context";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { Card, PageHeader } from "@/components/ui/card";
import { isInviteExpired, ROLE_LABELS, isMemberRole } from "@/lib/teams";
import { AcceptInviteButton } from "./AcceptButton";

export const metadata: Metadata = { title: "Workspace invite", robots: { index: false } };

export default async function InvitePage({ params }: { params: { inviteId: string } }) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="this invite" />;
  const res = await getAppContext();
  if (!res.ok) redirect(`/login?next=/invite/${params.inviteId}`);
  const admin = getServiceSupabase()!;

  const { data: row } = await admin.from("workspace_invites").select("id, email, role, expires_at, accepted_at").eq("id", params.inviteId).maybeSingle();
  const invite = row as { id: string; email: string; role: unknown; expires_at: string; accepted_at: string | null } | null;

  let body: React.ReactNode;
  if (!invite) {
    body = <p className="text-sm text-ink-soft">This invite doesn&apos;t exist — it may have been revoked.</p>;
  } else if (invite.accepted_at || isInviteExpired(invite.expires_at)) {
    body = <p className="text-sm text-ink-soft">This invite is no longer valid. Ask the workspace owner for a fresh one.</p>;
  } else if (invite.email.toLowerCase() !== (res.ctx.email ?? "").toLowerCase()) {
    body = (
      <p className="text-sm text-ink-soft">
        This invite is for <strong>{invite.email}</strong>, but you&apos;re signed in as {res.ctx.email ?? "unknown"}.{" "}
        <Link href="/login" className="font-semibold underline underline-offset-2">
          Switch account
        </Link>
      </p>
    );
  } else {
    const role = isMemberRole(invite.role) ? ROLE_LABELS[invite.role] : "member";
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink-soft">
          You&apos;ve been invited to join a workspace as <strong>{role}</strong> ({invite.email}).
        </p>
        <div className="mt-4">
          <AcceptInviteButton inviteId={invite.id} />
        </div>
      </>
    );
  }

  return (
    <AppShell ctx={res.ctx} active="account">
      <PageHeader eyebrow="Invite" title="Join workspace" description="One click and you're on the team." />
      <Card className="mt-6 max-w-lg">{body}</Card>
    </AppShell>
  );
}
