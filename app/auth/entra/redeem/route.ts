import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAuthSameOrigin, isEntraProofEnabled } from "@/lib/auth/config";
import { redeemNativeHandoff } from "@/lib/auth/store";
import { saveEntraSession } from "@/lib/auth/session";
import { safeAuthNext } from "@/lib/auth/redirect";
import { readAuthJson } from "@/lib/auth/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const payload = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/), verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export async function POST(request: Request) {
  if (!isEntraProofEnabled()) return new NextResponse(null, { status: 404 });
  try {
    assertAuthSameOrigin(request);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return new NextResponse(null, { status: 415 });
    const parsed = payload.safeParse(await readAuthJson(request));
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    const handoff = await redeemNativeHandoff(parsed.data.ticket, parsed.data.verifier);
    if (!handoff) return NextResponse.json({ error: "Sign-in expired. Please try again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    await saveEntraSession(handoff.token);
    return NextResponse.json({ next: safeAuthNext(handoff.next, "/auth/entra/proof") }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error(JSON.stringify({ event: "entra_native_handoff_rejected" }));
    return NextResponse.json({ error: "Could not finish sign-in. Please try again." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
