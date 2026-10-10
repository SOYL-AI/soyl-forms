import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { authCookieOptions } from "./config";
import { readDurableSession, revokeDurableSession } from "./store";
import type { AuthTransaction } from "./provider";

export async function getAuthTransactionCookie() {
  return getIronSession<{ transaction: AuthTransaction }>(await cookies(), authCookieOptions("transaction"));
}
export async function getAuthSessionCookie() {
  return getIronSession<{ token: string }>(await cookies(), authCookieOptions("session"));
}
export async function getEntraSessionUser() {
  const session = await getAuthSessionCookie();
  return session.token ? readDurableSession(session.token) : null;
}
/** Called only in route handlers/actions that can write cookies. */
export async function saveEntraSession(token: string): Promise<void> {
  const session = await getAuthSessionCookie();
  if (session.token) await revokeDurableSession(session.token);
  session.token = token;
  await session.save();
}
