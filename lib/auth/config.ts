import type { SessionOptions } from "iron-session";
import { isAzureBackend } from "@/lib/backend";

export const AUTH_TRANSACTION_SECONDS = 600;
export const AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_NATIVE_HANDOFF_SECONDS = 120;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

/** Deliberately opt-in while real-provider acceptance is pending. */
export function isEntraProofEnabled(): boolean {
  return isAzureBackend() || process.env.ENTRA_AUTH_PROOF_ENABLED === "true";
}

export function getEntraConfig() {
  const tenantId = required("ENTRA_TENANT_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("Invalid Entra tenant ID");
  }
  const origin = new URL(required("ENTRA_APP_ORIGIN"));
  const local = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if ((!local && origin.protocol !== "https:") || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("ENTRA_APP_ORIGIN must be an HTTPS origin (HTTP localhost is allowed for development)");
  }
  const password = required("AUTH_SESSION_SECRET");
  if (password.length < 64) throw new Error("AUTH_SESSION_SECRET must contain at least 64 random characters");
  return {
    tenantId,
    issuer: new URL(`https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`),
    clientId: required("ENTRA_CLIENT_ID"),
    clientSecret: required("ENTRA_CLIENT_SECRET"),
    origin: origin.origin,
    redirectUri: `${origin.origin}/auth/entra/callback`,
    secure: !local,
    password,
  };
}

export function authCookieOptions(kind: "session" | "transaction"): SessionOptions {
  const config = getEntraConfig();
  return {
    cookieName: `${config.secure ? "__Host-" : ""}soyl-${kind}`,
    password: config.password,
    ttl: kind === "transaction" ? AUTH_TRANSACTION_SECONDS : AUTH_SESSION_SECONDS,
    cookieOptions: { secure: config.secure, httpOnly: true, sameSite: "lax", path: "/" },
  };
}

export function assertAuthSameOrigin(request: Request): void {
  if (request.headers.get("origin") !== getEntraConfig().origin) throw new Error("Invalid request origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new Error("Invalid fetch origin");
}
