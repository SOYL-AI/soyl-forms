import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { respondentSession } from "@/lib/forms/respondent-session";
import { matchesFileType } from "@/lib/uploads/file-types";
import { choiceDistribution, matrixDistribution, npsScore, numericDistribution, rankingDistribution } from "@/lib/forms/distributions";
import { clientIp } from "@/lib/forms/public";
import type { AnswerValue, Block } from "@/types/forms";

const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ request: network.request }));
import { isPublicAddress, parsePublicUrl, publicFetch } from "@/lib/security/public-fetch";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("public network destinations", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.1.1", "169.254.169.254", "100.64.0.1", "192.168.1.2", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::"])("rejects %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it("allows public IPv4/IPv6 and rejects credentials, private aliases and alternate ports", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    for (const url of ["http://example.com", "https://localhost", "https://service.local", "https://user:pass@example.com", "https://example.com:8443", "https://2130706433", "https://[::1]"]) {
      expect(() => parsePublicUrl(url)).toThrow();
    }
  });
  it("rejects mixed public/private DNS answers before connecting", async () => {
    network.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(publicFetch("https://example.com")).rejects.toThrow(/Private/);
    expect(network.request).not.toHaveBeenCalled();
  });
  it("pins the connection IP, preserves TLS hostname, and refuses a redirect into localhost", async () => {
    network.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    network.request.mockImplementation((options, onResponse) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
        response.statusCode = 302; response.headers = { location: "https://127.0.0.1/private" };
        onResponse(response);
        queueMicrotask(() => response.emit("end"));
      };
      request.destroy = (error) => { request.emit("error", error); };
      expect(options.hostname).toBe("8.8.8.8");
      expect(options.servername).toBe("example.com");
      expect(options.headers.host).toBe("example.com");
      return request;
    });
    await expect(publicFetch("https://example.com", { redirects: 3 })).rejects.toThrow();
    expect(network.request).toHaveBeenCalledTimes(1);
  });
});

describe("respondent retry identity", () => {
  it("keeps identity, start time and original version across refreshes and replaces them for resume links", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const first = respondentSession(storage, "form", "version-one");
    expect(respondentSession(storage, "form", "version-two")).toEqual(first);
    const resumed = respondentSession(storage, "form", "version-one", { sessionId: "original-session", idempotencyKey: "original-submission" });
    expect(resumed.sessionId).toBe("original-session");
    expect(resumed.idempotencyKey).toBe("original-submission");
  });
  it("works without storage and ignores corrupt saved state", () => {
    expect(respondentSession(null, "form", "v").idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
    expect(respondentSession({ getItem: () => "broken", setItem: () => {} }, "form", "v").versionId).toBe("v");
  });
});

describe("upload contents and trusted proxies", () => {
  it("detects image/PDF contents and rejects extension-only type claims", () => {
    expect(matchesFileType(new Uint8Array([137,80,78,71,13,10,26,10]), "image/png")).toBe(true);
    expect(matchesFileType(new TextEncoder().encode("<script>alert(1)</script>"), "image/png")).toBe(false);
    expect(matchesFileType(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(matchesFileType(new Uint8Array([0,1,2]), "text/plain")).toBe(false);
    expect(matchesFileType(new TextEncoder().encode("<svg/>"), "image/svg+xml")).toBe(false);
  });
  it("ignores spoofed forwarded headers unless the operator selected a trusted proxy", () => {
    vi.stubEnv("TRUSTED_PROXY", "");
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1", "cf-connecting-ip": "8.8.8.8" });
    expect(clientIp(headers)).toBe("unknown");
    vi.stubEnv("TRUSTED_PROXY", "cloudflare");
    expect(clientIp(headers)).toBe("8.8.8.8");
    headers.set("cf-connecting-ip", "forged");
    expect(clientIp(headers)).toBe("unknown");
  });
});

describe("weighted database distributions", () => {
  it("counts groups without expanding thousands of responses", () => {
    const numeric: Block = { id: "q", type: "nps", title: "Score" };
    const answers = [{ q: { type: "nps", value: 10 } }, { q: { type: "nps", value: 0 } }] as Array<Record<string, AnswerValue>>;
    expect(numericDistribution(numeric, answers, [3000, 1000])).toMatchObject({ total: 4000, average: 7.5 });
    expect(npsScore(numeric, answers, [3000, 1000])).toMatchObject({ total: 4000, score: 50 });
    expect(choiceDistribution({ id: "q", type: "yes_no", title: "Yes?" }, [{ q: { type: "yes_no", value: "yes" } }], [3000])?.[0]?.count).toBe(3000);
    expect(matrixDistribution({ id: "q", type: "matrix", title: "Grid", rows: [{ id: "r", label: "Row" }], columns: [{ id: "c", label: "Col" }] },
      [{ q: { type: "matrix", value: { r: "c" } } }], [4000])?.rows[0]?.counts).toEqual([4000]);
    expect(rankingDistribution({ id: "q", type: "ranking", title: "Rank", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
      [{ q: { type: "ranking", value: ["a", "b"] } }], [4000])).toMatchObject({ total: 4000, options: [{ averagePosition: 1 }, { averagePosition: 2 }] });
  });
});
