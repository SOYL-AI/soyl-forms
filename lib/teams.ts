/**
 * Team roles and invite policy. Pure and client-safe: no Supabase imports.
 * Server enforcement lives in lib/team-actions.ts; RLS mirrors the same
 * ranks for user-owned clients.
 */

export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export const MEMBER_ROLES: MemberRole[] = ["owner", "admin", "editor", "viewer"];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: "Full control, including billing and deleting the workspace.",
  admin: "Invite members, edit forms, view responses.",
  editor: "Edit forms and responses. Can't manage members.",
  viewer: "View forms and responses. Can't edit anything.",
};

/** Upper bound on team size (abuse guard, plan-agnostic). */
export const MAX_TEAM_MEMBERS = 25;

const RANK: Record<MemberRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export function isMemberRole(raw: unknown): raw is MemberRole {
  return (
    typeof raw === "string" && (MEMBER_ROLES as string[]).includes(raw)
  );
}

/** Normalize an invite address. Null when it can't receive an invite. */
export function normalizeInviteEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Owners and admins manage the team. Everyone else is read-only here. */
export function canManageTeam(role: MemberRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return RANK[role] >= RANK[minimum];
}

/**
 * Can `actor` move `target` to `next`? Self-changes are never allowed here
 * (owners promote a successor first, then leave).
 */
export function canChangeRole(
  actor: MemberRole,
  target: MemberRole,
  next: MemberRole,
  actorIsSelf: boolean,
): boolean {
  if (!canManageTeam(actor)) return false;
  if (actorIsSelf) return false;
  if (next === target) return false;
  // Admins may only shuffle viewer/editor seats.
  if (actor === "admin" && (target === "owner" || target === "admin")) return false;
  if (actor === "admin" && (next === "owner" || next === "admin")) return false;
  return true;
}

/** Same seat rules as role changes, minus the no-op case. */
export function canRemoveMember(
  actor: MemberRole,
  target: MemberRole,
  actorIsSelf: boolean,
): boolean {
  if (!canManageTeam(actor)) return false;
  if (actorIsSelf) return false;
  if (actor === "admin" && (target === "owner" || target === "admin")) return false;
  return true;
}

/** Expired (or unreadable) invites can never be accepted. */
export function isInviteExpired(expiresAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t <= now;
}

/** URL-safe invite token (32 hex chars). */
export function newInviteToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e12).toString(36)}`;
}
