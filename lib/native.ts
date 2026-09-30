/**
 * The Android app is a Capacitor shell around this site. It appends
 * APP_USER_AGENT to the WebView's user agent (capacitor.config.ts) so the site
 * can adapt:
 *
 * - Google Play policy: digital purchases inside the app must use Play Billing,
 *   so every purchase entry point is tagged `native-hide` and hidden in the app
 *   (see the `html[data-native]` rules in app/globals.css).
 * - Google blocks OAuth inside WebViews, so Google sign-in opens in the system
 *   browser instead (lib/native-auth.ts).
 * - WebViews ignore downloads, so files go to the share sheet (lib/save-file.ts).
 */
export const APP_USER_AGENT = "SOYLFormsApp";

/** Custom scheme the app registers (AndroidManifest.xml) for returning from the browser. */
export const APP_SCHEME = "com.soylai.forms";

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent?.includes(APP_USER_AGENT));
}

/** Client-side: are we running inside the Android app? */
export function isNativeApp(): boolean {
  return typeof navigator !== "undefined" && isNativeUserAgent(navigator.userAgent);
}

/**
 * Inline <head> script: marks <html data-native> before first paint so
 * app-only and web-only UI never flashes, and static pages stay static.
 */
export const NATIVE_MARKER_SCRIPT = `if(navigator.userAgent.indexOf(${JSON.stringify(APP_USER_AGENT)})>-1)document.documentElement.setAttribute("data-native","")`;
