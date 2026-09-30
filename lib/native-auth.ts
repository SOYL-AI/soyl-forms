import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_SCHEME } from "@/lib/native";

/**
 * Google sign-in inside the Android app. Google refuses OAuth in embedded
 * WebViews (403 disallowed_useragent), so the consent screen opens in the
 * system browser (Custom Tabs). Supabase then redirects to
 * com.soylai.forms://auth/callback?code=…, which Android hands back to the app;
 * components/NativeBridge.tsx loads /auth/callback in the WebView, where the
 * PKCE verifier cookie set here completes the exchange.
 *
 * Requires `com.soylai.forms://auth/callback` in Supabase → Auth → URL
 * Configuration → Redirect URLs.
 */
export async function signInWithGoogleInApp(supabase: SupabaseClient, next: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${APP_SCHEME}://auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) return { error: error?.message ?? "Couldn't start Google sign-in." };
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
  return {};
}

/**
 * Map a URL the app was opened with to a path on this site, or null if it
 * isn't ours. Handles the custom-scheme OAuth return and verified App Links
 * (/f/… form links, /auth/callback email links).
 */
export function inAppPathFor(openedUrl: string, siteHost: string): string | null {
  let url: URL;
  try {
    url = new URL(openedUrl);
  } catch {
    return null;
  }
  if (url.protocol === `${APP_SCHEME}:`) {
    // com.soylai.forms://auth/callback?code=… → host "auth", pathname "/callback"
    return url.host === "auth" && url.pathname === "/callback" ? `/auth/callback${url.search}` : null;
  }
  if (url.protocol === "https:" && url.host === siteHost) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}
