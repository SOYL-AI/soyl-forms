// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RespondentClient } from "@/components/renderer/RespondentClient";
import type { FormSchemaV1 } from "@/types/forms";

const versionId = "11111111-1111-4111-8111-111111111111";
const schema: FormSchemaV1 = {
  schemaVersion: 1, title: "Survey", logic: [], blocks: [
    { id: "name", type: "short_text", title: "Your name", required: true },
    { id: "feedback", type: "short_text", title: "Your feedback", required: true },
    { id: "thanks", type: "thank_you", title: "Response saved" },
  ],
};
beforeEach(() => {
  vi.stubGlobal("React", React);
  window.sessionStorage.clear(); window.localStorage.clear();
  window.history.replaceState(null, "", "/f/survey");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("respondent recovery", () => {
  it("restores cross-device answers and the current question before interaction", async () => {
    render(<RespondentClient slug="survey" schema={schema} versionId={versionId} resume={{
      token: "a".repeat(32), sessionId: "original-session-id", idempotencyKey: "original-submission-key",
      answers: { name: { type: "short_text", value: "Ada" } }, currentId: "feedback", history: ["name"],
    }} />);
    await screen.findByRole("heading", { name: "Your feedback" });
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    await screen.findByRole("heading", { name: "Your name" });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Ada");
    expect(JSON.parse(window.sessionStorage.getItem("soyl:identity:survey")!).idempotencyKey).toBe("original-submission-key");
  });

  it("keeps drafts and submission identity through a refresh, then submits once", async () => {
    const first = render(<RespondentClient slug="survey" schema={schema} versionId={versionId} />);
    await screen.findByRole("heading", { name: "Your name" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await screen.findByRole("heading", { name: "Your feedback" });
    const identity = JSON.parse(window.sessionStorage.getItem("soyl:identity:survey")!);
    first.unmount();
    render(<RespondentClient slug="survey" schema={schema} versionId={versionId} />);
    await screen.findByRole("heading", { name: "Your feedback" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Great" } });
    fireEvent.click(screen.getByRole("button", { name: /^Submit/ }));
    await waitFor(() => expect(window.sessionStorage.getItem("soyl:identity:survey")).toBeNull());
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/submit"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]![1]!.body as string)).toMatchObject({
      sessionId: identity.sessionId, idempotencyKey: identity.idempotencyKey,
      answers: { name: { type: "short_text", value: "Ada" }, feedback: { type: "short_text", value: "Great" } },
    });
  });

  it("honors the per-device repeat restriction without a bypass button", async () => {
    window.localStorage.setItem("soyl:done:survey", "done");
    render(<RespondentClient slug="survey" schema={schema} versionId={versionId} settings={{ allowMultipleSubmissions: false }} />);
    await screen.findByText("You've already responded");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /again/i })).toBeNull();
  });
});
