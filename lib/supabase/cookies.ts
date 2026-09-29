/**
 * Auth cookie options shared by the browser, server and middleware clients.
 * The session is refreshed on every visit (see middleware.ts), so a user stays
 * signed in until they've been away for 30 days.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const authCookieOptions = {
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
