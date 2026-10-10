import { createClient } from "@supabase/supabase-js";
import { noStoreFetch } from "./fetch";
import { isAzureBackend } from "@/lib/backend";

/**
 * Service-role client. SERVER ONLY — it bypasses RLS.
 * Never import this module (transitively) from a client component.
 * Returns null when env is missing so callers fail with a clear message.
 */
export function getServiceSupabase() {
  if (isAzureBackend()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}
