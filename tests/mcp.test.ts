import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  hashMcpKey,
  keyPrefix,
  MCP_KEY_PREFIX,
  newMcpKey,
  parseBearer,
} from "@/lib/mcp/keys";
import {
  handleMcpBody,
  MCP_PROTOCOL_VERSION,
  McpToolError,
  type DispatchContext,
  type RegisteredTool,
} from "@/lib/mcp/protocol";
import { MCP_TOOLS } from "@/lib/mcp/tools";

describe("mcp api keys", () => {
  it("mints unique secrets with the soyl prefix", () => {
    const a = newMcpKey();
    const b = newMcpKey();
    expect(a.startsWith(MCP_KEY_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThan(70);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically to 64 hex chars", () => {
    const h1 = hashMcpKey("soyl_sk_abc");
    expect(h1).toBe(hashMcpKey("soyl_sk_abc"));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(hashMcpKey("soyl_sk_abd"));
  });

  it("derives a short non-secret prefix", () => {
    const secret = `${MCP_KEY_PREFIX}0123456789abcdef`;
    expect(keyPrefix(secret)).toBe("0123456789ab");
    expect(secret).toContain(keyPrefix(secret));
  });

  it("parses Bearer headers and rejects anything else", () => {
    expect(parseBearer(`Bearer ${MCP_KEY_PREFIX}x`)).toBe(`${MCP_KEY_PREFIX}x`);
    expect(parseBearer("bearer soyl_sk_x")).toBe("soyl_sk_x");
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer not-a-soyl-key")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
  });
});

const echoTool: RegisteredTool = {
  def: {
    name: "echo",
    description: "test echo",
    inputSchema: {
      type: "object",
      properties: { word: { type: "string" } },
      required: ["word"],
      additionalProperties: false,
    },
  },
  schema: z.object({ word: z.string().min(1) }),
  run: async (_ctx, input) => ({
    content: [{ type: "text", text: JSON.stringify(input) }],
  }),
};

const failingTool: RegisteredTool = {
  def: {
    name: "broke",
    description: "test curated failure",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  schema: z.object({}),
  run: async () => {
    throw new McpToolError("Out of credits.", -32002, "no_credits");
  },
};

const crashingTool: RegisteredTool = {
  def: {
    name: "crash",
    description: "test unexpected failure",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  schema: z.object({}),
  run: async () => {
    throw new Error("DB connection string leaked?");
  },
};

function ctx(tools: RegisteredTool[] = [echoTool, failingTool, crashingTool]): DispatchContext {
  return { workspaceId: "ws-1", tools };
}

describe("mcp protocol", () => {
  it("initializes with server info and negotiates the protocol version", async () => {
    const r = await handleMcpBody(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      ctx(),
    );
    expect(r.httpStatus).toBe(200);
    const body = r.json as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo.name).toBe("soyl-forms");
  });

  it("falls back to the newest version when the client asks for something unknown", async () => {
    const r = await handleMcpBody(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      ctx(),
    );
    expect((r.json as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      MCP_PROTOCOL_VERSION,
    );
  });

  it("lists tools from the registry", async () => {
    const r = await handleMcpBody({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx());
    const tools = (r.json as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((t) => t.name)).toEqual(["echo", "broke", "crash"]);
  });

  it("routes valid calls to the handler", async () => {
    const r = await handleMcpBody(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { word: "hi" } } },
      ctx(),
    );
    const result = (r.json as { result: { content: Array<{ text: string }> } }).result;
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({ word: "hi" });
  });

  it("rejects unknown tools and bad params without running anything", async () => {
    const r1 = await handleMcpBody(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } },
      ctx(),
    );
    expect((r1.json as { error: { code: number } }).error.code).toBe(-32601);

    const r2 = await handleMcpBody(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "echo", arguments: { word: "" } } },
      ctx(),
    );
    const badParams = r2.json as { error: { code: number; data: { code: string } } };
    expect(badParams.error.code).toBe(-32602);
    expect(badParams.error.data.code).toBe("invalid_params");
  });

  it("maps curated failures to their hint, unexpected ones to generic", async () => {
    const r1 = await handleMcpBody(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "broke", arguments: {} } },
      ctx(),
    );
    const curated = r1.json as { error: { code: number; message: string; data: { code: string } } };
    expect(curated.error.code).toBe(-32002);
    expect(curated.error.data.code).toBe("no_credits");

    const r2 = await handleMcpBody(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "crash", arguments: {} } },
      ctx(),
    );
    const crash = r2.json as { error: { code: number; message: string } };
    expect(crash.error.code).toBe(-32603);
    expect(crash.error.message).not.toContain("leaked");
  });

  it("answers 202 with no body for notifications-only input", async () => {
    const r = await handleMcpBody(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      ctx(),
    );
    expect(r.httpStatus).toBe(202);
    expect(r.json).toBeUndefined();
  });

  it("handles batches and rejects empty ones", async () => {
    const r = await handleMcpBody(
      [
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "bogus" },
      ],
      ctx(),
    );
    const out = r.json as Array<{ id: number }>;
    expect(out.map((m) => m.id)).toEqual([1, 2]);

    const empty = await handleMcpBody([], ctx());
    expect((empty.json as { error: { code: number } }).error.code).toBe(-32600);
  });

  it("rejects malformed messages as Invalid Request", async () => {
    for (const bad of [null, 42, "x", { method: "tools/list" }, []] as unknown[]) {
      const r = await handleMcpBody(bad, ctx());
      expect((r.json as { error: { code: number } }).error.code).toBe(-32600);
    }
  });
});

describe("mcp live tool registry", () => {
  it("advertises exactly the three spike tools", () => {
    expect(MCP_TOOLS.map((t) => t.def.name)).toEqual(["list_forms", "get_form_schema", "draft_form"]);
  });

  it("keeps JSON schemas in sync with their Zod validators", () => {
    for (const tool of MCP_TOOLS) {
      // Every JSON-declared required field must actually be required by Zod.
      for (const field of tool.def.inputSchema.required ?? []) {
        expect(tool.schema.safeParse({}).success, `${tool.def.name}.${field}`).toBe(false);
      }
      // Every Zod-required field must be declared required in JSON.
      const shape = (tool.schema as unknown as { _def?: unknown })._def;
      expect(shape).toBeDefined();
    }
    const draft = MCP_TOOLS.find((t) => t.def.name === "draft_form");
    expect(draft?.def.inputSchema.required).toEqual(["description"]);
    expect(draft?.schema.safeParse({ description: "short" }).success).toBe(false);
    expect(
      draft?.schema.safeParse({ description: "a long enough form description here" }).success,
    ).toBe(true);
  });

  it("get_form_schema takes exactly one of formId or slug", () => {
    const get = MCP_TOOLS.find((t) => t.def.name === "get_form_schema");
    expect(get).toBeDefined();
    const s = get?.schema as z.ZodTypeAny;
    expect(s.safeParse({}).success).toBe(false);
    expect(s.safeParse({ slug: "abc", formId: "00000000-0000-0000-0000-000000000000" }).success).toBe(false);
    expect(s.safeParse({ slug: "abc" }).success).toBe(true);
    expect(s.safeParse({ formId: "not-a-uuid" }).success).toBe(false);
  });

  it("list_forms defaults and caps its limit", () => {
    const list = MCP_TOOLS.find((t) => t.def.name === "list_forms");
    const s = list?.schema as z.ZodTypeAny;
    expect(s.safeParse({}).success).toBe(true);
    expect(s.safeParse({ limit: 0 }).success).toBe(false);
    expect(s.safeParse({ limit: 51 }).success).toBe(false);
  });
});
