/**
 * Provider plumbing for the AI features. Every caller asks for a JSON object
 * and gets back the raw text to parse — the prompts live with the features.
 *
 * Providers (AI_PROVIDER):
 * - `openai` (default): any OpenAI-compatible `/chat/completions` + Bearer key.
 * - `azure-foundry`: Azure AI Foundry serverless inference (same wire format).
 * - `azure-openai`: classic Azure OpenAI (`api-key` header + api-version).
 * - `anthropic`: Claude via the official SDK (see ./anthropic.ts).
 */

export type AiProvider = "openai" | "azure-foundry" | "azure-openai" | "anthropic";

export function aiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (raw === "azure-foundry" || raw === "azure_foundry") return "azure-foundry";
  if (raw === "azure-openai" || raw === "azure_openai") return "azure-openai";
  if (raw === "anthropic" || raw === "claude") return "anthropic";
  return "openai";
}

/** The company that processes AI requests, for the privacy policy's processor list. */
export function aiProcessorName(): string {
  const provider = aiProvider();
  if (provider === "anthropic") return "Anthropic";
  if (provider === "azure-foundry" || provider === "azure-openai") return "Microsoft Azure AI";
  let host = "";
  try {
    host = new URL(process.env.AI_BASE_URL ?? "https://api.openai.com/v1").hostname;
  } catch {
    /* fall through to a generic name */
  }
  if (host === "api.openai.com") return "OpenAI";
  if (host.endsWith(".azure.com")) return "Microsoft Azure AI";
  return "Our AI model provider";
}

/** True when an AI provider is configured. */
export function isAiConfigured(): boolean {
  if (aiProvider() === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY);
  }
  return Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
}

function baseUrl(): string {
  const provider = aiProvider();
  const fallback =
    provider === "azure-openai"
      ? "https://YOUR-RESOURCE.openai.azure.com"
      : provider === "azure-foundry"
        ? "https://YOUR-RESOURCE.services.ai.azure.com/models"
        : "https://api.openai.com/v1";
  return (process.env.AI_BASE_URL ?? fallback).replace(/\/+$/, "");
}

function endpointUrl(model: string): string {
  if (aiProvider() === "azure-openai") {
    const version = process.env.AI_API_VERSION ?? "2024-10-21";
    return `${baseUrl()}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${version}`;
  }
  return `${baseUrl()}/chat/completions`;
}

function authHeaders(): Record<string, string> {
  if (aiProvider() === "azure-openai") {
    return { "api-key": process.env.AI_API_KEY as string };
  }
  return { authorization: `Bearer ${process.env.AI_API_KEY}` };
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Reasoning models (o-series, GPT-5 and later, including GPT-6) reject a custom
 * temperature and `max_tokens`; they take `max_completion_tokens` and a
 * reasoning effort instead. AI_REASONING_EFFORT (none|low|medium|high) forces
 * reasoning mode for deployments whose name doesn't reveal the model.
 */
export function isReasoningModel(model: string): boolean {
  return Boolean(process.env.AI_REASONING_EFFORT) || /^(o\d|gpt-([5-9]|\d{2}))/i.test(model);
}

function requestBody(model: string, req: ChatJsonRequest, json: boolean): Record<string, unknown> {
  const reasoning = isReasoningModel(model);
  return {
    model,
    // Supported by every current chat model; reasoning tokens count against it.
    max_completion_tokens: req.maxTokens ?? 4000,
    ...(reasoning
      ? { reasoning_effort: process.env.AI_REASONING_EFFORT || "low" }
      : { temperature: req.temperature ?? 0.4 }),
    ...(json ? { response_format: { type: "json_object" } } : {}),
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  };
}

/** One completion that should contain a JSON object. Returns the raw text. */
export async function chatJson(req: ChatJsonRequest): Promise<string> {
  if (!isAiConfigured()) {
    throw new AiProviderError("AI generation isn't connected (missing provider key).");
  }
  if (aiProvider() === "anthropic") {
    const { anthropicChatJson } = await import("./anthropic");
    return anthropicChatJson(req);
  }
  const model = process.env.AI_MODEL as string;
  let res: Response;
  try {
    res = await fetch(endpointUrl(model), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(requestBody(model, req, true)),
      signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
    });
  } catch (e) {
    throw new AiProviderError(
      e instanceof Error && e.name === "TimeoutError"
        ? "The AI provider took too long. Try again."
        : "Couldn't reach the AI provider.",
    );
  }
  if (!res.ok) {
    // Some OpenAI-compatible servers reject response_format; retry without it once.
    if (res.status === 400) {
      const retry = await fetch(endpointUrl(model), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(requestBody(model, req, false)),
        signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
      }).catch(() => null);
      if (retry?.ok) return contentOf(await retry.json());
    }
    throw new AiProviderError("The AI provider refused the request. Try again in a bit.", res.status);
  }
  return contentOf(await res.json());
}

function contentOf(data: unknown): string {
  const content = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
    ?.content;
  if (!content) throw new AiProviderError("The AI provider returned nothing usable.");
  return content;
}

/** Extract the JSON object from model output (tolerates code fences/prose). */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
