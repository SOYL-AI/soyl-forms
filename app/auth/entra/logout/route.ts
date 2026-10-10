import { NextResponse } from "next/server";
import { assertAuthSameOrigin, getEntraConfig, isEntraProofEnabled } from "@/lib/auth/config";
import { getAuthSessionCookie } from "@/lib/auth/session";
import { revokeDurableSession } from "@/lib/auth/store";
import { providerLogoutUrl } from "@/lib/auth/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isEntraProofEnabled()) return new NextResponse(null, { status: 404 });
  try { assertAuthSameOrigin(request); } catch { return new NextResponse(null, { status: 403 }); }
  const session = await getAuthSessionCookie();
  // Fail visibly if shared revocation is unavailable; clearing one browser is insufficient.
  try { if (session.token) await revokeDurableSession(session.token); } catch {
    return NextResponse.json({ error: "Sign-out is temporarily unavailable. Please try again." }, { status: 503 });
  }
  session.destroy();
  let destination: URL | null = null;
  try { destination = await providerLogoutUrl(); } catch { /* Local session is already revoked. */ }
  return NextResponse.redirect(destination ?? `${getEntraConfig().origin}/auth/entra/proof`, 303);
}
