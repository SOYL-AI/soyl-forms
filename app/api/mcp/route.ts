import { NextResponse } from "next/server";
import { handleMcpBody } from "@/lib/mcp/protocol";
import { MCP_TOOLS } from "@/lib/mcp/tools";
import { parseBearer, verifyMcpKey } from "@/lib/mcp/keys";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

/**
 * Stateless MCP endpoint (Streamable HTTP, JSON-RPC 2.0).
 * Auth: `Authorization: Bearer soyl_sk_…` → workspace scope.
 */
export async function POST(req: Request) {
  const secret = parseBearer(req.headers.get("authorization"));
  if (!secret) {
    return NextResponse.json(
      { error: "Pass your workspace API key as a Bearer token.", code: "auth" },
      { status: 401 },
    );
  }
  const verified = await verifyMcpKey(secret);
  if (!verified) {
    return NextResponse.json(
      { error: "That API key is invalid or revoked.", code: "auth" },
      { status: 401 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(`mcp:${verified.prefix}:${ip}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Slow down a little.", code: "rate_limited" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } },
      { status: 200 },
    );
  }

  const { httpStatus, json } = await handleMcpBody(body, {
    workspaceId: verified.workspaceId,
    tools: MCP_TOOLS,
  });
  if (httpStatus === 202) return new NextResponse(null, { status: 202 });
  return NextResponse.json(json, { status: 200 });
}

/** No SSE stream on this server — POST only. */
export async function GET() {
  return NextResponse.json(
    { error: "This MCP server accepts POST with JSON-RPC bodies only.", code: "method_not_allowed" },
    { status: 405 },
  );
}
