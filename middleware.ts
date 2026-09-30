import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { authCookieOptions } from "@/lib/supabase/cookies";
import { isNativeUserAgent } from "@/lib/native";

/** In the Android app, marketing and purchase pages lead to the app itself (Play Billing policy). */
const NATIVE_REDIRECTS: Record<string, string> = {
  "/": "/dashboard",
  "/features": "/dashboard",
  "/pricing": "/dashboard",
  "/billing/credits": "/billing",
};

/**
 * Refreshes the Supabase session on every page request and writes the rotated
 * tokens back as cookies. Server Components can't set cookies, so without this
 * an expired access token was never persisted and users were signed out.
 */
export async function middleware(request: NextRequest) {
  if (isNativeUserAgent(request.headers.get("user-agent"))) {
    const target = NATIVE_REDIRECTS[request.nextUrl.pathname];
    if (target) return NextResponse.redirect(new URL(target, request.url));
  }

  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Must run before any response is returned: it triggers the token refresh.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Skip static assets, public forms, and machine-to-machine endpoints.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|opengraph-image|f/|api/webhooks|api/cron|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
