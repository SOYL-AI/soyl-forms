import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";

/**
 * Operator feature flags (super-admin → Settings). Read server-side at the
 * enforcement points: signup provisioning, uploads, upgrades, AI. Defaults
 * are permissive so a missing row never locks the product.
 */
export const platformFlagsSchema = z.object({
  registrationsEnabled: z.boolean().default(true),
  uploadsEnabled: z.boolean().default(true),
  upgradesEnabled: z.boolean().default(true),
  aiEnabled: z.boolean().default(true),
  /** Short notice shown at the top of the signed-in app when non-empty. */
  maintenanceBanner: z.string().max(300).default(""),
});

export type PlatformFlags = z.infer<typeof platformFlagsSchema>;

export const DEFAULT_FLAGS: PlatformFlags = platformFlagsSchema.parse({});

export async function getPlatformFlags(): Promise<PlatformFlags> {
  const admin = getServiceSupabase();
  if (!admin) return DEFAULT_FLAGS;
  try {
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "flags")
      .maybeSingle();
    const parsed = platformFlagsSchema.safeParse((data as { value: unknown } | null)?.value ?? {});
    return parsed.success ? parsed.data : DEFAULT_FLAGS;
  } catch {
    // Table not migrated yet — behave as if everything is on.
    return DEFAULT_FLAGS;
  }
}

export async function setPlatformFlags(flags: PlatformFlags, updatedBy: string): Promise<void> {
  const admin = getServiceSupabase();
  if (!admin) throw new Error("Server misconfigured.");
  const { error } = await admin.from("platform_settings").upsert(
    { key: "flags", value: flags, updated_by: updatedBy, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}
