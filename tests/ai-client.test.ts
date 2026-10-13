import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatJson, isReasoningModel } from "@/lib/ai/client";

function stubProvider(status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    status === 200 ? Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] }) : new Response("{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const body = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

describe("AI provider request shape", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "azure-foundry");
    vi.stubEnv("AI_BASE_URL", "https://example.services.ai.azure.com/openai/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_REASONING_EFFORT", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("recognises reasoning models by name or explicit configuration", () => {
    for (const m of ["gpt-6-luna", "gpt-6.1-sol", "gpt-5-mini", "o4-mini", "GPT-10"]) expect(isReasoningModel(m)).toBe(true);
    for (const m of ["gpt-4o", "gpt-4.1-mini", "my-deployment"]) expect(isReasoningModel(m)).toBe(false);
    vi.stubEnv("AI_REASONING_EFFORT", "medium");
    expect(isReasoningModel("my-deployment")).toBe(true);
  });

  it("sends GPT-6 max_completion_tokens and a reasoning effort, never a temperature", async () => {
    vi.stubEnv("AI_MODEL", "gpt-6-luna");
    const fetchMock = stubProvider();
    await chatJson({ system: "s", user: "u", maxTokens: 6000, temperature: 0.5 });
    const sent = body(fetchMock.mock.calls[0]);
    expect(sent).toMatchObject({ model: "gpt-6-luna", max_completion_tokens: 6000, reasoning_effort: "low", response_format: { type: "json_object" } });
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("max_tokens");
  });

  it("keeps temperature for classic chat models", async () => {
    vi.stubEnv("AI_MODEL", "gpt-4o");
    const fetchMock = stubProvider();
    await chatJson({ system: "s", user: "u", temperature: 0.3 });
    const sent = body(fetchMock.mock.calls[0]);
    expect(sent).toMatchObject({ temperature: 0.3, max_completion_tokens: 4000 });
    expect(sent).not.toHaveProperty("reasoning_effort");
  });

  it("retries a rejected JSON-mode request without response_format, same token parameter", async () => {
    vi.stubEnv("AI_MODEL", "gpt-6-luna");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      JSON.parse(String(init?.body)).response_format ? new Response("{}", { status: 400 }) : Response.json({ choices: [{ message: { content: "{}" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chatJson({ system: "s", user: "u" })).resolves.toBe("{}");
    expect(body(fetchMock.mock.calls[1])).toMatchObject({ max_completion_tokens: 4000, reasoning_effort: "low" });
  });
});
