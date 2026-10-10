import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { safeAuthNext } from "@/lib/auth/redirect";
import { assertAuthSameOrigin, authCookieOptions, getEntraConfig } from "@/lib/auth/config";
import { readAuthJson } from "@/lib/auth/request-body";

const db = new PGlite();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function scalar<T>(sql: string, values: unknown[] = []): Promise<T> {
  return (await db.query<{ value: T }>(`select ${sql} as value`, values)).rows[0]!.value;
}
const issuer = "https://customer.ciamlogin.com/customer/v2.0";
async function user(subject: string, email = "same@example.com") {
  return scalar<string>("identity.resolve_user($1,$2,$3,true,'Customer')", [issuer, subject, email]);
}
beforeAll(async () => { await db.exec(readFileSync(new URL("../azure/migrations/0001_identity.sql", import.meta.url), "utf8")); }, 60_000);
afterAll(async () => { await db.close(); vi.unstubAllEnvs(); });

describe("Azure identity security", () => {
  it("keeps distinct provider subjects separate even when their emails match", async () => {
    const first = await user("first"), second = await user("second");
    expect(first).not.toBe(second);
    expect(await user("first")).toBe(first);
    const other = await scalar<string>("identity.resolve_user($1,'first',$2,true,null)", ["https://other.example", "same@example.com"]);
    expect(other).not.toBe(first);
  });
  it("does not grant email ownership when the provider omits verification", async () => {
    const id = await scalar<string>("identity.resolve_user($1,'unverified','same@example.com',false,null)", [issuer]);
    expect(await scalar("(select email_verified from app_users where id=$1)", [id])).toBe(false);
  });
  it("consumes OAuth state exactly once and rejects expired transactions", async () => {
    await scalar("identity.begin_oauth($1)", [hash("state")]);
    expect(await scalar("identity.consume_oauth($1)", [hash("state")])).toBe(true);
    expect(await scalar("identity.consume_oauth($1)", [hash("state")])).toBe(false);
    await scalar("identity.begin_oauth($1)", [hash("expired")]);
    await db.query("update identity.oauth_transactions set expires_at=now()-interval '1 minute' where state_hash=$1", [hash("expired")]);
    expect(await scalar("identity.consume_oauth($1)", [hash("expired")])).toBe(false);
  });
  it("rejects expired, revoked and disabled-account sessions", async () => {
    const id = await user("sessions"), token = hash("session");
    await scalar("identity.create_session($1,$2)", [id, token]);
    expect(await scalar("(select id from identity.read_session($1))", [token])).toBe(id);
    await db.query("update app_users set status='disabled' where id=$1", [id]);
    expect(await scalar("(select id from identity.read_session($1))", [token])).toBeNull();
    await expect(scalar("identity.create_session($1,$2)", [id, hash("disabled")])).rejects.toThrow("Account unavailable");
    await expect(user("sessions")).rejects.toThrow("Account unavailable");
    await db.query("update app_users set status='active' where id=$1", [id]);
    await scalar("identity.revoke_session($1)", [token]);
    expect(await scalar("(select id from identity.read_session($1))", [token])).toBeNull();
    await scalar("identity.create_session($1,$2)", [id, token]);
    await db.query("update identity.sessions set expires_at=now()-interval '1 minute' where token_hash=$1", [token]);
    expect(await scalar("(select id from identity.read_session($1))", [token])).toBeNull();
  });
  it("requires possession of the app verifier and consumes a native ticket once", async () => {
    const id = await user("native"), ticket = hash("ticket"), challenge = "a".repeat(43);
    await scalar("identity.create_handoff($1,$2,$3,'/auth/entra/proof')", [id, ticket, challenge]);
    expect(await scalar("identity.redeem_handoff($1,$2,$3)", [ticket, "b".repeat(43), hash("wrong")])).toBeNull();
    expect(await scalar("identity.redeem_handoff($1,$2,$3)", [ticket, challenge, hash("native-session")])).toBe("/auth/entra/proof");
    expect(await scalar("identity.redeem_handoff($1,$2,$3)", [ticket, challenge, hash("replay")])).toBeNull();
    expect(await scalar("(select count(*)::int from identity.sessions where token_hash=$1)", [hash("wrong")])).toBe(0);
  });
  it("cannot redeem an expired ticket or create a session for a disabled user", async () => {
    const id = await user("expired-native"), ticket = hash("expired-ticket"), challenge = "c".repeat(43);
    await scalar("identity.create_handoff($1,$2,$3,'/auth/entra/proof')", [id, ticket, challenge]);
    await db.query("update identity.native_handoffs set expires_at=now()-interval '1 minute' where ticket_hash=$1", [ticket]);
    expect(await scalar("identity.redeem_handoff($1,$2,$3)", [ticket, challenge, hash("expired-session")])).toBeNull();
    await db.query("update identity.native_handoffs set expires_at=now()+interval '1 minute' where ticket_hash=$1", [ticket]);
    await db.query("update app_users set status='disabled' where id=$1", [id]);
    await expect(scalar("identity.redeem_handoff($1,$2,$3)", [ticket, challenge, hash("disabled-session")])).rejects.toThrow("Account unavailable");
  });
  it("gives the runtime auth function access without raw table or cleanup privileges", async () => {
    await db.exec("set role soyl_auth");
    try {
      expect(await scalar("identity.consume_oauth($1)", [hash("missing")])).toBe(false);
      await expect(db.query("select * from identity.sessions")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.app_users")).rejects.toThrow(/permission denied/);
      await expect(scalar("identity.cleanup_expired()")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });
});

describe("auth configuration and redirect boundaries", () => {
  it("rejects oversized streamed bodies regardless of the claimed Content-Length", async () => {
    const request = new Request("https://forms.example/auth/entra/redeem", { method: "POST", body: "x".repeat(513), headers: { "Content-Length": "1" } });
    await expect(readAuthJson(request)).rejects.toThrow("exceeds auth limit");
    await expect(readAuthJson(new Request("https://forms.example", { method: "POST", body: '{"ticket":"ok"}' }))).resolves.toEqual({ ticket: "ok" });
  });
  it.each(["//evil.example", "/\\evil.example", "/%5cevil.example", "/%2fevil.example", "/%255cevil.example", "/\nevil.example", "https://evil.example", "javascript:alert(1)"])("rejects redirect %s", (value) => {
    expect(safeAuthNext(value)).toBe("/dashboard");
  });
  it("preserves internal navigation and checkout parameters", () => {
    expect(safeAuthNext("/billing/checkout?plan=pro&period=yearly")).toBe("/billing/checkout?plan=pro&period=yearly");
  });
  it("requires secure origins, independent secrets and same-origin mutations", () => {
    vi.stubEnv("ENTRA_TENANT_ID", "47f0c7e0-77a5-4ae0-b3b4-b9b48269d014");
    vi.stubEnv("ENTRA_CLIENT_ID", "test-client"); vi.stubEnv("ENTRA_CLIENT_SECRET", "test-secret");
    vi.stubEnv("AUTH_SESSION_SECRET", "random-test-secret-".repeat(5));
    vi.stubEnv("ENTRA_APP_ORIGIN", "https://forms.soylai.com");
    expect(authCookieOptions("session")).toMatchObject({ cookieName: "__Host-soyl-session", cookieOptions: { secure: true, httpOnly: true, sameSite: "lax", path: "/" } });
    expect(() => assertAuthSameOrigin(new Request("https://forms.soylai.com", { headers: { Origin: "https://evil.example" } }))).toThrow();
    expect(() => assertAuthSameOrigin(new Request("https://forms.soylai.com", { headers: { Origin: "https://forms.soylai.com", "Sec-Fetch-Site": "cross-site" } }))).toThrow();
    expect(() => assertAuthSameOrigin(new Request("https://forms.soylai.com", { headers: { Origin: "https://forms.soylai.com" } }))).not.toThrow();
    vi.stubEnv("ENTRA_APP_ORIGIN", "http://forms.soylai.com"); expect(() => getEntraConfig()).toThrow();
    vi.stubEnv("ENTRA_APP_ORIGIN", "http://localhost:3000"); expect(getEntraConfig().secure).toBe(false);
    vi.stubEnv("AUTH_SESSION_SECRET", "too-short"); expect(() => getEntraConfig()).toThrow();
  });
});
