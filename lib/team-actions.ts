"use server";

import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/config";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import {
  MAX_TEAM_MEMBERS,
  canChangeRole,
  canManageTeam,
  canRemoveMember,
  isInviteExpired,
  isMemberRole,
  newInviteToken,
  normalizeInviteEmail,
  type MemberRole,
} from "@/lib/teams";

export type TeamActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface TeamMember {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: MemberRole;
  isSelf: boolean;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  link: string;
}

/** Caller's role in the workspace, or null when not a member. */
export async function getMyRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role: unknown } | null)?.role;
  return isMemberRole(role) ? role : null;
}

async function memberCount(workspaceId: string): Promise<{ members: number; owners: number }> {
  const admin = getServiceSupabase()!;
  const { data } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId);
  const roles = ((data ?? []) as Array<{ role: unknown }>).map((m) => m.role);
  return {
    members: roles.length,
    owners: roles.filter((r) => r === "owner").length,
  };
}

/** Members + pending invites. Any member may read; management is gated per action. */
export async function listTeam(workspaceId: string): Promise<TeamActionResult<{ members: TeamMember[]; invites: TeamInvite[]; myRole: MemberRole }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const myRole = await getMyRole(workspaceId, userId);
  if (!myRole) return { ok: false, error: "You don't belong to this workspace." };

  const [{ data: rows }, { data: inviteRows }] = await Promise.all([
    admin.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    canManageTeam(myRole)
      ? admin.from("workspace_invites").select("id, email, role, expires_at").eq("workspace_id", workspaceId).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const members: TeamMember[] = [];
  for (const m of (rows ?? []) as Array<{ user_id: string; role: unknown }>) {
    let email: string | null = null;
    let displayName: string | null = null;
    try {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id);
      email = u?.user?.email ?? null;
    } catch {
      // Deleted auth users keep a rowless membership; still listed.
    }
    try {
      const { data: p } = await admin.from("profiles").select("display_name").eq("id", m.user_id).maybeSingle();
      displayName = (p as { display_name: string | null } | null)?.display_name ?? null;
    } catch {
      // Profile is optional.
    }
    members.push({
      userId: m.user_id,
      email,
      displayName,
      role: isMemberRole(m.role) ? m.role : "viewer",
      isSelf: m.user_id === userId,
    });
  }

  const invites: TeamInvite[] = ((inviteRows ?? []) as Array<{ id: string; email: string; role: unknown; expires_at: string }>)
    .filter((i) => !isInviteExpired(i.expires_at))
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: isMemberRole(i.role) ? i.role : "viewer",
      expiresAt: i.expires_at,
      link: `${getAppUrl()}/invite/${i.id}`,
    }));

  return { ok: true, members, invites, myRole };
}

/**
 * Invite an address to the workspace. Sends an email when configured and
 * always returns a copyable link. Re-inviting refreshes the token + expiry.
 */
export async function inviteMember(args: {
  workspaceId: string;
  email: string;
  role: MemberRole;
}): Promise<TeamActionResult<{ link: string; emailed: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const myRole = await getMyRole(args.workspaceId, userId);
  if (!canManageTeam(myRole)) return { ok: false, error: "Only owners and admins can invite." };

  const email = normalizeInviteEmail(args.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (!isMemberRole(args.role)) return { ok: false, error: "Pick a valid role." };
  if (myRole === "admin" && (args.role === "owner" || args.role === "admin")) {
    return { ok: false, error: "Admins can invite viewers and editors only." };
  }

  const { members } = await memberCount(args.workspaceId);
  if (members >= MAX_TEAM_MEMBERS) {
    return { ok: false, error: `Workspaces are limited to ${MAX_TEAM_MEMBERS} members.` };
  }

  const { data: invite, error } = await admin
    .from("workspace_invites")
    .upsert(
      {
        workspace_id: args.workspaceId,
        email,
        role: args.role,
        token: newInviteToken(),
        invited_by: userId,
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        accepted_at: null,
      },
      { onConflict: "workspace_id,email" },
    )
    .select("id")
    .single();
  if (error || !invite) return { ok: false, error: "Couldn't create the invite. Please try again." };

  const link = `${getAppUrl()}/invite/${(invite as { id: string }).id}`;
  let emailed = false;
  if (isEmailConfigured()) {
    const res = await sendEmail({
      to: [email],
      subject: "You've been invited to a Soyl Forms workspace",
      text: `You've been invited as ${args.role}.\n\nAccept within 7 days: ${link}\n\nIf you don't have an account yet, sign up with this email first, then open the link.`,
      html: `<p>You've been invited as <strong>${args.role}</strong>.</p><p><a href="${link}">Accept the invite</a> (expires in 7 days).</p><p>If you don't have an account yet, sign up with this email first, then open the link.</p>`,
    });
    emailed = res.ok;
  }
  return { ok: true, link, emailed };
}

export async function revokeInvite(args: { workspaceId: string; inviteId: string }): Promise<TeamActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  if (!canManageTeam(await getMyRole(args.workspaceId, userId))) {
    return { ok: false, error: "Only owners and admins can revoke invites." };
  }
  const { error } = await admin
    .from("workspace_invites")
    .delete()
    .eq("id", args.inviteId)
    .eq("workspace_id", args.workspaceId);
  if (error) return { ok: false, error: "Couldn't revoke the invite." };
  return { ok: true };
}

/**
 * Claim an invite. The signed-in address must match the invite. Joining a
 * second workspace is refused — Soyl is single-workspace per user, so the
 * invitee leaves (or is removed from) their current workspace first.
 */
export async function acceptInvite(args: { inviteId: string }): Promise<TeamActionResult<{ workspaceId: string }>> {
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };

  const { data: row } = await admin.from("workspace_invites").select("*").eq("id", args.inviteId).maybeSingle();
  const invite = row as {
    id: string;
    workspace_id: string;
    email: string;
    role: unknown;
    expires_at: string;
    accepted_at: string | null;
  } | null;
  if (!invite) return { ok: false, error: "This invite doesn't exist (it may have been revoked)." };
  if (invite.accepted_at) return { ok: false, error: "This invite was already used." };
  if (isInviteExpired(invite.expires_at)) return { ok: false, error: "This invite expired. Ask for a fresh one." };
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: `This invite is for ${invite.email}. You're signed in as ${user.email}.` };
  }

  const { data: existing } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);
  const memberships = (existing ?? []) as Array<{ workspace_id: string }>;
  if (memberships.some((m) => m.workspace_id === invite.workspace_id)) {
    await admin.from("workspace_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    return { ok: true, workspaceId: invite.workspace_id };
  }
  if (memberships.length > 1) {
    return { ok: false, error: "You already belong to workspaces. Leave them from Account first." };
  }
  if (memberships.length === 1 && memberships[0].workspace_id !== invite.workspace_id) {
    // Fresh signups auto-provision an empty personal workspace. Absorb it
    // so the invite just works; anything with content is left alone.
    const { count: coMembers } = await admin
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", memberships[0].workspace_id);
    const { count: coForms } = await admin
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", memberships[0].workspace_id);
    if ((coMembers ?? 0) === 1 && (coForms ?? 0) === 0) {
      await admin.from("workspaces").delete().eq("id", memberships[0].workspace_id);
    } else {
      return { ok: false, error: "You already belong to a workspace. Leave it from Account first." };
    }
  }

  const role = isMemberRole(invite.role) ? invite.role : "viewer";
  const { error: memberError } = await admin.from("workspace_members").upsert(
    { workspace_id: invite.workspace_id, user_id: user.id, role },
    { onConflict: "workspace_id,user_id" },
  );
  if (memberError) return { ok: false, error: "Couldn't join the workspace. Please try again." };
  await admin.from("workspace_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  return { ok: true, workspaceId: invite.workspace_id };
}

export async function changeMemberRole(args: {
  workspaceId: string;
  userId: string;
  role: MemberRole;
}): Promise<TeamActionResult> {
  const actorId = await getSessionUserId();
  if (!actorId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const actorRole = await getMyRole(args.workspaceId, actorId);
  if (!actorRole) return { ok: false, error: "You don't belong to this workspace." };

  const { data: target } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId)
    .maybeSingle();
  const targetRole = (target as { role: unknown } | null)?.role;
  if (!isMemberRole(targetRole)) return { ok: false, error: "That person isn't on the team." };
  if (!isMemberRole(args.role)) return { ok: false, error: "Pick a valid role." };
  if (!canChangeRole(actorRole, targetRole, args.role, actorId === args.userId)) {
    return { ok: false, error: "You can't make that change." };
  }
  if (targetRole === "owner" && args.role !== "owner") {
    const { owners } = await memberCount(args.workspaceId);
    if (owners <= 1) return { ok: false, error: "Promote someone to owner first — a workspace needs one." };
  }
  const { error } = await admin
    .from("workspace_members")
    .update({ role: args.role })
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId);
  if (error) return { ok: false, error: "Couldn't update the role." };
  return { ok: true };
}

export async function removeMember(args: { workspaceId: string; userId: string }): Promise<TeamActionResult> {
  const actorId = await getSessionUserId();
  if (!actorId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const actorRole = await getMyRole(args.workspaceId, actorId);
  if (!actorRole) return { ok: false, error: "You don't belong to this workspace." };

  const { data: target } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId)
    .maybeSingle();
  const targetRole = (target as { role: unknown } | null)?.role;
  if (!isMemberRole(targetRole)) return { ok: false, error: "That person isn't on the team." };
  if (!canRemoveMember(actorRole, targetRole, actorId === args.userId)) {
    return { ok: false, error: "You can't remove that person (use Leave to exit yourself)." };
  }
  if (targetRole === "owner") {
    const { owners } = await memberCount(args.workspaceId);
    if (owners <= 1) return { ok: false, error: "Promote someone to owner first — a workspace needs one." };
  }
  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId);
  if (error) return { ok: false, error: "Couldn't remove that person." };
  return { ok: true };
}

/** Exit a workspace yourself. The last owner must promote a successor first. */
export async function leaveWorkspace(args: { workspaceId: string }): Promise<TeamActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const role = await getMyRole(args.workspaceId, userId);
  if (!role) return { ok: false, error: "You don't belong to this workspace." };
  if (role === "owner") {
    const { owners } = await memberCount(args.workspaceId);
    if (owners <= 1) return { ok: false, error: "Promote someone to owner first — a workspace needs one." };
  }
  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: "Couldn't leave the workspace." };
  return { ok: true };
}
