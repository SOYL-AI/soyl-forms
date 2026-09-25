import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError, type ChatJsonRequest } from "./client";

/**
 * Claude provider via the official SDK. Model defaults to Claude Opus 5 with
 * adaptive thinking (on by default for Opus 5) at a tunable effort, and
 * server-side refusal fallbacks so a rare safety decline re-runs on a
 * fallback model inside the same call instead of failing the user.
 *
 *   AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=...  [AI_MODEL=claude-opus-5]  [AI_EFFORT=medium]
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AI_API_KEY,
      timeout: 90_000,
      maxRetries: 2,
    });
  }
  return client;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

function effort(): Effort {
  const raw = (process.env.AI_EFFORT ?? "medium").toLowerCase();
  return (["low", "medium", "high", "xhigh", "max"] as Effort[]).includes(raw as Effort)
    ? (raw as Effort)
    : "medium";
}

export async function anthropicChatJson(req: ChatJsonRequest): Promise<string> {
  const model = process.env.AI_MODEL?.trim() || "claude-opus-5";
  try {
    const response = await getClient().beta.messages.create(
      {
        model,
        max_tokens: Math.max(1024, req.maxTokens ?? 6000),
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: req.system,
        thinking: { type: "adaptive" },
        output_config: { effort: effort() },
        messages: [{ role: "user", content: req.user }],
      },
      { timeout: req.timeoutMs ?? 90_000 },
    );
    if (response.stop_reason === "refusal") {
      throw new AiProviderError("The AI declined this request. Try rephrasing your description.");
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new AiProviderError("The AI returned nothing usable.");
    return text;
  } catch (e) {
    if (e instanceof AiProviderError) throw e;
    if (e instanceof Anthropic.AuthenticationError) {
      throw new AiProviderError("The AI provider rejected the API key.", 401);
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new AiProviderError("The AI provider is busy. Try again in a moment.", 429);
    }
    if (e instanceof Anthropic.BadRequestError) {
      throw new AiProviderError("The AI provider rejected the request.", 400);
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new AiProviderError("Couldn't reach the AI provider.");
    }
    if (e instanceof Anthropic.APIError) {
      throw new AiProviderError("The AI provider returned an error. Try again in a bit.", e.status);
    }
    throw new AiProviderError("Generation failed.");
  }
}
