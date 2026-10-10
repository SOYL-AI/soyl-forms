import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./client";
import { authCookieOptions } from "./cookies";
import { noStoreFetch } from "./fetch";
import { isAzureBackend } from "@/lib/backend";
import { getEntraSessionUser } from "@/lib/auth/session";

/**
 * Server-side Supabase client (Server Components / Actions / Route Handlers).
 * Returns null when env is not configured so pages can render an honest
 * "configuration required" state instead of crashing.
 */
export async function getServerSupabase() {
  if (isAzureBackend()) return null;
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      cookieOptions: authCookieOptions,
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where set is a no-op.
          }
        },
      },
    },
  );
}

/** Current user id for the request, or null (signed out / unconfigured). */
export async function getSessionUserId(): Promise<string | null> {
  if (isAzureBackend()) return (await getEntraSessionUser())?.id ?? null;
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
