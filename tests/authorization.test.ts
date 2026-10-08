import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "viewer", userId: "user", rpc: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSessionUserId: async () => state.userId, getServerSupabase: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ getServiceSupabase: () => ({ rpc: state.rpc, from: (table: string) => {
  const row = table === "workspace_members" ? { role: state.role } : { id: "form", workspace_id: "workspace", title: "Form", draft_revision: 0 };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row }), single: async () => ({ data: row }), update: state.update };
  return query;
} }) }));
import { createWebhook, deleteWebhook, getFormForOwner, publishForm, setWebhookActive, testWebhook } from "@/lib/forms/actions";

beforeEach(() => { state.role = "viewer"; vi.clearAllMocks(); });
describe("viewer authorization", () => {
  it("allows form reads", async () => { expect(await getFormForOwner("form")).toHaveProperty("form.id", "form"); });
  it("blocks publication before any privileged RPC", async () => {
    expect(await publishForm({ formId: "form" })).toMatchObject({ ok: false });
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("blocks all webhook mutations before provider calls", async () => {
    expect(await createWebhook({ formId: "form", url: "https://example.com" })).toMatchObject({ ok: false });
    expect(await deleteWebhook({ webhookId: "hook" })).toMatchObject({ ok: false });
    expect(await setWebhookActive({ webhookId: "hook", active: false })).toMatchObject({ ok: false });
    expect(await testWebhook({ webhookId: "hook" })).toMatchObject({ ok: false });
    expect(state.update).not.toHaveBeenCalled();
  });
});
