import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/db/pool";
import { isEntraProofEnabled } from "@/lib/auth/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!isEntraProofEnabled()) return new NextResponse(null, { status: 404 });
  try {
    // Confirms connectivity, runtime permissions and the identity schema without exposing rows.
    await getDatabasePool().query("select * from identity.read_session($1)", ["0".repeat(64)]);
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
