import * as oidc from "openid-client";
import { getEntraConfig } from "./config";
import type { ProviderIdentity } from "./store";

let discovery: Promise<oidc.Configuration> | undefined;
async function configuration(): Promise<oidc.Configuration> {
  if (!discovery) {
    const config = getEntraConfig();
    discovery = oidc.discovery(config.issuer, config.clientId, config.clientSecret, undefined, {
      timeout: 10,
      execute: [oidc.enableNonRepudiationChecks],
    }).catch((error: unknown) => { discovery = undefined; throw error; });
  }
  return discovery;
}

export interface AuthTransaction {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  createdAt: number;
  nativeChallenge?: string;
}

export async function createAuthorization(next: string, nativeChallenge?: string) {
  const transaction: AuthTransaction = {
    state: oidc.randomState(), nonce: oidc.randomNonce(), verifier: oidc.randomPKCECodeVerifier(),
    next, createdAt: Date.now(), nativeChallenge,
  };
  const url = oidc.buildAuthorizationUrl(await configuration(), {
    redirect_uri: getEntraConfig().redirectUri,
    response_type: "code", scope: "openid profile email",
    code_challenge: await oidc.calculatePKCECodeChallenge(transaction.verifier), code_challenge_method: "S256",
    state: transaction.state, nonce: transaction.nonce,
    // A fresh account choice avoids silent login into the wrong customer account.
    prompt: "select_account",
  });
  return { transaction, url };
}

/** Only claims verified by openid-client reach the identity repository. */
export async function exchangeAuthorization(url: URL, transaction: AuthTransaction): Promise<ProviderIdentity> {
  const tokens = await oidc.authorizationCodeGrant(await configuration(), url, {
    pkceCodeVerifier: transaction.verifier, expectedState: transaction.state,
    expectedNonce: transaction.nonce, idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.iss !== getEntraConfig().issuer.href) {
    throw new Error("Provider identity not verified");
  }
  return {
    issuer: claims.iss, subject: claims.sub,
    objectId: typeof claims.oid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.oid) ? claims.oid : null,
    email: typeof claims.email === "string" ? claims.email : null,
    // Entra may omit email_verified. Do not infer ownership from the email claim alone.
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}

export async function providerLogoutUrl(): Promise<URL | null> {
  const endpoint = (await configuration()).serverMetadata().end_session_endpoint;
  if (!endpoint) return null;
  const url = new URL(endpoint);
  url.searchParams.set("client_id", getEntraConfig().clientId);
  url.searchParams.set("post_logout_redirect_uri", `${getEntraConfig().origin}/auth/entra/proof`);
  return url;
}
