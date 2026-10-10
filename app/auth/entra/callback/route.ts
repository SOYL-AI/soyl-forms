import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AUTH_TRANSACTION_SECONDS, getEntraConfig, isEntraProofEnabled } from "@/lib/auth/config";
import { exchangeAuthorization } from "@/lib/auth/provider";
import { getAuthTransactionCookie, saveEntraSession } from "@/lib/auth/session";
import { consumeAuthTransaction, createDurableSession, createNativeHandoff, resolveEntraUser } from "@/lib/auth/store";
import { safeAuthNext } from "@/lib/auth/redirect";
import { APP_SCHEME } from "@/lib/native";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function equalState(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!isEntraProofEnabled()) return new NextResponse(null, { status: 404 });
  const config = getEntraConfig();
  try {
    const incoming = new URL(request.url);
    const cookie = await getAuthTransactionCookie();
    const transaction = cookie.transaction;
    if (!transaction || Date.now() - transaction.createdAt > AUTH_TRANSACTION_SECONDS * 1000 || transaction.createdAt > Date.now() ||
        incoming.searchParams.getAll("state").length !== 1 || !equalState(incoming.searchParams.get("state"), transaction.state)) {
      throw new Error("Invalid authorization transaction");
    }
    cookie.destroy();
    if (!await consumeAuthTransaction(transaction.state)) throw new Error("Authorization transaction already consumed");
    // Use the registered origin rather than forwarded or incoming Host headers.
    const canonical = new URL(config.redirectUri);
    canonical.search = incoming.search;
    const identity = await exchangeAuthorization(canonical, transaction);
    const userId = await resolveEntraUser(identity);
    const next = safeAuthNext(transaction.next, "/auth/entra/proof");
    let destination: string;
    if (transaction.nativeChallenge) {
      const ticket = await createNativeHandoff(userId, transaction.nativeChallenge, next);
      destination = `${APP_SCHEME}://auth/entra-return?ticket=${encodeURIComponent(ticket)}`;
    } else {
      await saveEntraSession(await createDurableSession(userId));
      destination = `${config.origin}${next}`;
    }
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    console.error(JSON.stringify({ event: "entra_authorization_callback_rejected" }));
    return NextResponse.redirect(`${config.origin}/auth/entra/proof?error=auth`);
  }
}
