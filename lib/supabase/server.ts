import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./client";

/**
 * Server-side Supabase client (Server Components / Actions / Route Handlers).
 * Returns null when env is not configured so pages can render an honest
 * "configuration required" state instead of crashing.
 */
export function getServerSupabase() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
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
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
