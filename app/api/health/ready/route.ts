import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/db/pool";
import { isAzureBackend } from "@/lib/backend";
import { isEntraProofEnabled } from "@/lib/auth/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!isEntraProofEnabled()) return new NextResponse(null, { status: 404 });
  try {
    // Confirms connectivity, runtime permissions and the identity schema without exposing rows.
    await getDatabasePool().query("select * from identity.read_session($1)", ["0".repeat(64)]);
    if (isAzureBackend() && process.env.AUTH_PROOF_ONLY!=="true") {
      if (!process.env.RATE_LIMIT_SECRET || !process.env.WEBHOOK_ENCRYPTION_KEY) throw new Error("Core configuration missing");
      const version=(await getDatabasePool().query<{version:string}>("select platform.schema_version() as version")).rows[0]?.version;
      if(!version || version<"0024_worker_observability.sql") throw new Error("Platform schema is behind this application");
    }
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
