import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";

const tenant = "47f0c7e0-77a5-4ae0-b3b4-b9b48269d014";
const issuer = `https://${tenant}.ciamlogin.com/${tenant}/v2.0`;
const clientId = "oidc-test-client";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "fixture-key", use: "sig", alg: "RS256" };
let idClaims: Record<string, unknown>;
let badSignature = false;

function signedToken() {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(idClaims)).toString("base64url");
  const input = `${head}.${body}`;
  return `${input}.${createSign("RSA-SHA256").update(input).sign(badSignature ? wrongKeys.privateKey : keys.privateKey).toString("base64url")}`;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ENTRA_TENANT_ID", tenant); vi.stubEnv("ENTRA_CLIENT_ID", clientId);
  vi.stubEnv("ENTRA_CLIENT_SECRET", "client-secret"); vi.stubEnv("ENTRA_APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("AUTH_SESSION_SECRET", "fixture-secret-".repeat(6));
  badSignature = false;
  idClaims = { iss: issuer, aud: clientId, sub: "subject-123", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, email: "customer@example.com", email_verified: true };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(".well-known")) return Response.json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/keys`,
      response_types_supported: ["code"], subject_types_supported: ["pairwise"], id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"], code_challenge_methods_supported: ["S256"],
    });
    if (url.endsWith("/keys")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/token")) {
      expect(new URLSearchParams(String(init?.body)).get("code_verifier")).toBeTruthy();
      return Response.json({ access_token: "opaque-access-token", token_type: "Bearer", expires_in: 300, id_token: signedToken() });
    }
    throw new Error("Unexpected provider request");
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function setup() {
  const provider = await import("@/lib/auth/provider");
  const { transaction, url } = await provider.createAuthorization("/auth/entra/proof");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  idClaims.nonce = transaction.nonce;
  const callback = new URL(`http://localhost:3000/auth/entra/callback?code=fixture-code&state=${transaction.state}`);
  return { provider, transaction, callback };
}

describe("maintained OIDC verification", () => {
  it("accepts a correctly signed ID token with matching issuer, audience, state and nonce", async () => {
    const { provider, transaction, callback } = await setup();
    expect(await provider.exchangeAuthorization(callback, transaction)).toMatchObject({ subject: "subject-123", issuer, emailVerified: true });
  });
  it.each(["issuer", "audience", "nonce", "expiry", "signature", "state"])("rejects an invalid %s", async (field) => {
    const { provider, transaction, callback } = await setup();
    if (field === "issuer") idClaims.iss = "https://evil.example";
    if (field === "audience") idClaims.aud = "wrong-app";
    if (field === "nonce") idClaims.nonce = "wrong-nonce";
    if (field === "expiry") idClaims.exp = Math.floor(Date.now() / 1000) - 600;
    if (field === "signature") badSignature = true;
    if (field === "state") callback.searchParams.set("state", "wrong-state");
    await expect(provider.exchangeAuthorization(callback, transaction)).rejects.toThrow();
  });
});
