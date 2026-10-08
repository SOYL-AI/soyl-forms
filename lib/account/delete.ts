"use server";

import { auditLog } from "@/lib/admin";
import { getRazorpay, isRazorpayConfigured } from "@/lib/billing/razorpay";
import { deleteR2Object, isR2Configured } from "@/lib/r2";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";

const DELETE_CONFIRMATION = "DELETE";

/**
 * Permanently delete the signed-in user's account (Google Play requires this
 * in-app). Order matters: everything that could block or outlive the auth
 * user goes first, so a failure part-way can simply be retried.
 *
 * 1. Cancel live Razorpay subscriptions on workspaces they own.
 * 2. Delete those workspaces' files from R2.
 * 3. Delete the workspaces (forms, responses, brand kits, usage cascade).
 * 4. Detach them from records in workspaces they don't own (nullable FKs).
 * 5. Delete the auth user (profile, memberships, admin role cascade).
 */
export async function deleteMyAccount(args: { confirmation: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (args.confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION) {
    return { ok: false, error: `Type ${DELETE_CONFIRMATION} to confirm.` };
  }
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Account deletion is temporarily unavailable. Please try again later." };

  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_user_id", userId);
  const workspaceIds = ((owned ?? []) as Array<{ id: string }>).map((w) => w.id);

  if (workspaceIds.length > 0) {
    // 1. Stop future charges. A provider failure must not leave them billed for a deleted account.
    const { data: subs } = await admin
      .from("subscriptions")
      .select("provider_subscription_id, status")
      .in("workspace_id", workspaceIds)
      .not("provider_subscription_id", "is", null);
    // Only states that can still charge; "created" (checkout never paid) can't be cancelled at Razorpay.
    const live = ((subs ?? []) as Array<{ provider_subscription_id: string; status: string }>).filter((s) =>
      ["authenticated", "active", "pending", "halted"].includes(s.status),
    );
    if (live.length > 0) {
      const rzp = isRazorpayConfigured() ? getRazorpay() : null;
      if (!rzp) return { ok: false, error: "We couldn't cancel your subscription. Please contact support." };
      for (const s of live) {
        try {
          await rzp.subscriptions.cancel(s.provider_subscription_id, false);
        } catch {
          return { ok: false, error: "We couldn't cancel your subscription. Please try again or contact support." };
        }
      }
    }

    // 2. Stored files (best-effort: an orphaned private object is harmless, a blocked deletion isn't).
    if (isR2Configured()) {
      const { data: files } = await admin.from("uploaded_files").select("r2_key").in("workspace_id", workspaceIds);
      for (const f of (files ?? []) as Array<{ r2_key: string }>) {
        await deleteR2Object(f.r2_key).catch(() => {});
      }
    }

    // 3. Workspaces and everything in them.
    const { error: wsError } = await admin.from("workspaces").delete().in("id", workspaceIds);
    if (wsError) return { ok: false, error: "We couldn't delete your workspace. Please try again." };
  }

  // 4. Records they created in other people's workspaces stay, without their name.
  await Promise.all([
    admin.from("forms").update({ created_by: null }).eq("created_by", userId),
    admin.from("form_versions").update({ published_by: null }).eq("published_by", userId),
    admin.from("brand_kits").update({ created_by: null }).eq("created_by", userId),
    admin.from("admin_users").update({ created_by: null }).eq("created_by", userId),
    admin.from("platform_settings").update({ updated_by: null }).eq("updated_by", userId),
  ]);

  // 5. The login itself.
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) return { ok: false, error: "We couldn't finish deleting your account. Please try again." };

  await auditLog({ actorUserId: null, actorType: "user", action: "account.deleted", targetType: "user", targetId: userId });
  await (await getServerSupabase())?.auth.signOut().catch(() => {});
  return { ok: true };
}
