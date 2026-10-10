import { describe, expect, it, vi } from "vitest";
import { isNativeUserAgent } from "@/lib/native";
import { inAppPathFor } from "@/lib/native-auth";

const HOST = "forms.soylai.com";

describe("isolated Android auth preview", () => {
  it("uses its own scheme and does not accept production app returns", async () => {
    vi.stubEnv("NEXT_PUBLIC_NATIVE_APP_SCHEME", "com.soylai.forms.authproof");
    vi.resetModules();
    try {
      const native = await import("@/lib/native");
      const auth = await import("@/lib/native-auth");
      expect(native.APP_SCHEME).toBe("com.soylai.forms.authproof");
      const ticket = "a".repeat(43);
      expect(auth.inAppPathFor(`com.soylai.forms.authproof://auth/entra-return?ticket=${ticket}`, HOST)).toBe(`/auth/entra/native-return?ticket=${ticket}`);
      expect(auth.inAppPathFor(`com.soylai.forms://auth/entra-return?ticket=${ticket}`, HOST)).toBeNull();
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
});

describe("isNativeUserAgent", () => {
  it("recognises the Android app", () => {
    expect(isNativeUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile SOYLFormsApp")).toBe(true);
  });
  it("ignores normal browsers and missing headers", () => {
    expect(isNativeUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile")).toBe(false);
    expect(isNativeUserAgent(null)).toBe(false);
  });
});

describe("inAppPathFor", () => {
  it("routes Entra's one-use ticket without accepting a reusable token or arbitrary path", () => {
    const ticket = "a".repeat(43);
    expect(inAppPathFor(`com.soylai.forms://auth/entra-return?ticket=${ticket}`, HOST)).toBe(`/auth/entra/native-return?ticket=${ticket}`);
    expect(inAppPathFor("com.soylai.forms://auth/entra-return?token=secret", HOST)).toBeNull();
    expect(inAppPathFor("com.soylai.forms://auth/entra-return?ticket=invalid", HOST)).toBeNull();
    expect(inAppPathFor(`com.soylai.forms://evil@auth/entra-return?ticket=${ticket}`, HOST)).toBeNull();
  });
  it("turns the Google sign-in return into the site's callback, keeping code and next", () => {
    expect(inAppPathFor("com.soylai.forms://auth/callback?next=%2Fcreate&code=abc", HOST)).toBe("/auth/callback?next=%2Fcreate&code=abc");
  });
  it("opens verified App Links for this site in the app", () => {
    expect(inAppPathFor(`https://${HOST}/f/launch-survey?src=qr`, HOST)).toBe("/f/launch-survey?src=qr");
    expect(inAppPathFor(`https://${HOST}/auth/callback?code=xyz`, HOST)).toBe("/auth/callback?code=xyz");
  });
  it("rejects other hosts, other scheme paths and junk", () => {
    expect(inAppPathFor("https://evil.example/f/x", HOST)).toBeNull();
    expect(inAppPathFor("com.soylai.forms://somewhere/else", HOST)).toBeNull();
    expect(inAppPathFor("javascript:alert(1)", HOST)).toBeNull();
    expect(inAppPathFor("not a url", HOST)).toBeNull();
  });
});
