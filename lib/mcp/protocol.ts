import { z } from "zod";

export const MCP_SERVER_NAME = "soyl-forms";
export const MCP_SERVER_VERSION = "0.1.0";
/** Newest first. The client's version is echoed when supported. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MCP_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0] as string;

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ToolContext {
  workspaceId: string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (ctx: ToolContext, input: unknown) => Promise<ToolResult>;

export interface RegisteredTool {
  def: ToolDefinition;
  schema: z.ZodTypeAny;
  run: ToolHandler;
}

/** Curated failure: message is safe to show the agent, hint is machine-readable. */
export class McpToolError extends Error {
  constructor(
    message: string,
    readonly rpcCode = -32603,
    readonly hint = "internal",
  ) {
    super(message);
  }
}

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: RpcError;
}

function err(id: string | number | null, code: number, message: string, data?: unknown): RpcResponse {
  return data === undefined
    ? { jsonrpc: "2.0", id, error: { code, message } }
    : { jsonrpc: "2.0", id, error: { code, message, data } };
}

function ok(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export interface DispatchContext extends ToolContext {
  tools: RegisteredTool[];
}

function findTool(ctx: DispatchContext, name: string): RegisteredTool | null {
  return ctx.tools.find((t) => t.def.name === name) ?? null;
}

async function dispatchOne(msg: unknown, ctx: DispatchContext): Promise<RpcResponse | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return err(null, -32600, "Invalid Request.");
  }
  const { jsonrpc, id, method, params } = msg as Record<string, unknown>;
  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return err(typeof id === "string" || typeof id === "number" ? id : null, -32600, "Invalid Request.");
  }
  const rpcId = id === undefined ? null : (id as string | number | null);
  const isNotification = id === undefined;

  if (method === "notifications/initialized") return null;

  if (method === "initialize") {
    if (isNotification) return null;
    const asked = (params as { protocolVersion?: unknown } | null)?.protocolVersion;
    const version =
      typeof asked === "string" && MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSION;
    return ok(rpcId, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    });
  }

  if (method === "tools/list") {
    if (isNotification) return null;
    return ok(rpcId, { tools: ctx.tools.map((t) => t.def) });
  }

  if (method === "tools/call") {
    if (isNotification) return null;
    const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
    if (typeof p.name !== "string") {
      return err(rpcId, -32602, "Invalid params: `name` must be a string.", { code: "invalid_params" });
    }
    const tool = findTool(ctx, p.name);
    if (!tool) {
      return err(rpcId, -32601, `Unknown tool "${p.name}".`);
    }
    const args = p.arguments === undefined ? {} : p.arguments;
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return err(rpcId, -32602, `Invalid params for "${p.name}": ${parsed.error.issues[0]?.message ?? "check the input shape."}`, {
        code: "invalid_params",
      });
    }
    try {
      const result = await tool.run({ workspaceId: ctx.workspaceId }, parsed.data);
      return ok(rpcId, result);
    } catch (e) {
      if (e instanceof McpToolError) {
        return err(rpcId, e.rpcCode, e.message, { code: e.hint });
      }
      console.error(`[mcp] tools/call ${p.name} failed:`, e);
      return err(rpcId, -32603, "Something went wrong.", { code: "internal" });
    }
  }

  if (method.startsWith("notifications/")) return null;
  if (isNotification) return null;
  return err(rpcId, -32601, `Method not found: "${method}".`);
}

/**
 * Handle a parsed POST body (single message or batch). Returns the HTTP
 * status and JSON payload — 202 with `json: undefined` when the body held
 * only notifications.
 */
export async function handleMcpBody(
  body: unknown,
  ctx: DispatchContext,
): Promise<{ httpStatus: 200 | 202; json: unknown }> {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return { httpStatus: 200, json: err(null, -32600, "Invalid Request: empty batch.") };
    }
    const out: RpcResponse[] = [];
    for (const msg of body.slice(0, 32)) {
      const r = await dispatchOne(msg, ctx);
      if (r) out.push(r);
    }
    if (out.length === 0) return { httpStatus: 202, json: undefined };
    return { httpStatus: 200, json: out };
  }
  const r = await dispatchOne(body, ctx);
  if (!r) return { httpStatus: 202, json: undefined };
  return { httpStatus: 200, json: r };
}
