import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const legacyAuth = vi.hoisted(() => vi.fn(() => { throw new Error("Legacy auth must not run in the Azure auth preview"); }));
vi.mock("@supabase/ssr", () => ({ createServerClient: legacyAuth }));
import { middleware } from "@/middleware";

beforeEach(() => {
  vi.stubEnv("AUTH_PROOF_ONLY", "true");
  vi.stubEnv("ENTRA_APP_ORIGIN", "https://preview.example");
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("Azure auth preview boundary", () => {
  it("blocks platform mutations instead of reaching legacy production integrations", async () => {
    const response = await middleware(new NextRequest("https://preview.example/api/billing/subscribe", { method: "POST" }));
    expect(response.status).toBe(404);
    expect(legacyAuth).not.toHaveBeenCalled();
  });
  it("redirects other pages using the configured origin even if the request host is forged", async () => {
    const response = await middleware(new NextRequest("https://evil.example/dashboard"));
    expect(response.headers.get("Location")).toBe("https://preview.example/auth/entra/proof");
  });
  it("allows only the isolated auth routes and deployment probes through", async () => {
    for (const path of ["/auth/entra/proof", "/auth/entra/callback", "/api/health/live", "/api/health/ready"]) {
      expect((await middleware(new NextRequest(`https://preview.example${path}`))).headers.get("x-middleware-next")).toBe("1");
    }
    expect(legacyAuth).not.toHaveBeenCalled();
  });
});
