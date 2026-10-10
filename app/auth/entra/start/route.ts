import { NextResponse } from "next/server";
import { getEntraConfig, isEntraProofEnabled } from "@/lib/auth/config";
import { createAuthorization } from "@/lib/auth/provider";
import { getAuthTransactionCookie } from "@/lib/auth/session";
import { beginAuthTransaction } from "@/lib/auth/store";
import { safeAuthNext } from "@/lib/auth/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isEntraProofEnabled()) return new NextResponse(null, { status: 404 });
  try {
    const input = new URL(request.url);
    const challenge = input.searchParams.get("native_challenge") ?? undefined;
    if (challenge !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return new NextResponse(null, { status: 400 });
    const next = safeAuthNext(input.searchParams.get("next"), "/auth/entra/proof");
    const { transaction, url } = await createAuthorization(next, challenge);
    const cookie = await getAuthTransactionCookie();
    await beginAuthTransaction(transaction.state);
    cookie.transaction = transaction;
    await cookie.save();
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    console.error(JSON.stringify({ event: "entra_authorization_start_failed" }));
    return NextResponse.redirect(`${getEntraConfig().origin}/auth/entra/proof?error=unavailable`);
  }
}
