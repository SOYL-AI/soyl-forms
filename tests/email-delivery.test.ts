import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: state.send }));
vi.mock("@/lib/supabase/admin", () => ({ getServiceSupabase: () => ({ rpc: state.rpc,
  from: () => ({ update: (value: unknown) => ({ eq: () => state.save(value) }) }),
}) }));
import { deliverEmail } from "@/lib/email/deliver";

beforeEach(() => { vi.resetAllMocks(); state.save.mockResolvedValue({ error: null }); });
describe("email retries", () => {
  it("reuses the reserved payload and provider key after notification settings change", async () => {
    const frozen = { to: ["original@example.com"], subject: "Original", html: "Original", text: "Original", from: "sender@example.com" };
    state.rpc.mockResolvedValue({ data: { status: "reserved", request: frozen, created_at: new Date().toISOString() } });
    state.send.mockResolvedValue({ ok: false });
    const changed = { to: ["changed@example.com"], subject: "Changed", html: "Changed", text: "Changed" };
    expect(await deliverEmail("event:owners", "workspace", 10, changed)).toBe("failed");
    expect(state.save).not.toHaveBeenCalled();
    state.send.mockResolvedValue({ ok: true });
    expect(await deliverEmail("event:owners", "workspace", 10, changed)).toBe("sent");
    expect(state.send.mock.calls.map(([mail]) => mail)).toEqual([
      { ...frozen, idempotencyKey: "event:owners" }, { ...frozen, idempotencyKey: "event:owners" },
    ]);
    expect(state.save).toHaveBeenCalledWith({ status: "sent", request: {} });
  });
  it("does not resend an acknowledged delivery", async () => {
    state.rpc.mockResolvedValue({ data: { status: "sent" } });
    expect(await deliverEmail("key", "workspace", 10, { to: ["a@example.com"], subject: "s", html: "h", text: "h" })).toBe("sent");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("stops ambiguous retries before the provider's deduplication window expires", async () => {
    state.rpc.mockResolvedValue({ data: { status: "reserved", request: {}, created_at: new Date(Date.now() - 24 * 3600_000).toISOString() } });
    expect(await deliverEmail("key", "workspace", 10, { to: ["a@example.com"], subject: "s", html: "h", text: "h" })).toBe("uncertain");
    expect(state.send).not.toHaveBeenCalled();
  });
});
