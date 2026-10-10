import { createHash, randomBytes } from "node:crypto";
import { getDatabasePool } from "@/lib/db/pool";

export function newAuthToken(): string { return randomBytes(32).toString("base64url"); }
export function hashAuthToken(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function nativeChallenge(verifier: string): string { return createHash("sha256").update(verifier).digest("base64url"); }

export interface EntraUser { id: string; email: string | null; email_verified: boolean; display_name: string | null }
export interface ProviderIdentity { issuer: string; subject: string; email: string | null; emailVerified: boolean; name: string | null }

export async function beginAuthTransaction(state: string): Promise<void> {
  await getDatabasePool().query("select identity.begin_oauth($1)", [hashAuthToken(state)]);
}
export async function consumeAuthTransaction(state: string): Promise<boolean> {
  const result = await getDatabasePool().query<{ consumed: boolean }>("select identity.consume_oauth($1) as consumed", [hashAuthToken(state)]);
  return result.rows[0]?.consumed === true;
}
export async function resolveEntraUser(identity: ProviderIdentity): Promise<string> {
  const result = await getDatabasePool().query<{ id: string }>("select identity.resolve_user($1,$2,$3,$4,$5) as id",
    [identity.issuer, identity.subject, identity.email, identity.emailVerified, identity.name]);
  if (!result.rows[0]?.id) throw new Error("Identity could not be resolved");
  return result.rows[0].id;
}
export async function createDurableSession(userId: string): Promise<string> {
  const token = newAuthToken();
  await getDatabasePool().query("select identity.create_session($1,$2)", [userId, hashAuthToken(token)]);
  return token;
}
export async function readDurableSession(token: string): Promise<EntraUser | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await getDatabasePool().query<EntraUser>("select * from identity.read_session($1)", [hashAuthToken(token)]);
  return result.rows[0] ?? null;
}
export async function revokeDurableSession(token: string): Promise<void> {
  await getDatabasePool().query("select identity.revoke_session($1)", [hashAuthToken(token)]);
}
export async function createNativeHandoff(userId: string, challenge: string, next: string): Promise<string> {
  const ticket = newAuthToken();
  await getDatabasePool().query("select identity.create_handoff($1,$2,$3,$4)", [userId, hashAuthToken(ticket), challenge, next]);
  return ticket;
}
export async function redeemNativeHandoff(ticket: string, verifier: string): Promise<{ token: string; next: string } | null> {
  const token = newAuthToken();
  const result = await getDatabasePool().query<{ next: string | null }>("select identity.redeem_handoff($1,$2,$3) as next",
    [hashAuthToken(ticket), nativeChallenge(verifier), hashAuthToken(token)]);
  return result.rows[0]?.next ? { token, next: result.rows[0].next } : null;
}
