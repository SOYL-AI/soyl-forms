export interface RespondentSession {
  sessionId: string;
  idempotencyKey: string;
  startedAt: number;
  versionId: string;
}

export function respondentSession(storage: Pick<Storage, "getItem" | "setItem"> | null, slug: string, versionId: string,
  resume?: { sessionId: string; idempotencyKey: string }) : RespondentSession {
  const key = `soyl:identity:${slug}`;
  if (!resume && storage) {
    try {
      const saved = JSON.parse(storage.getItem(key) ?? "null") as RespondentSession | null;
      if (saved && typeof saved.sessionId === "string" && saved.sessionId.length >= 16 &&
          typeof saved.idempotencyKey === "string" && saved.idempotencyKey.length >= 16 &&
          typeof saved.versionId === "string" && Number.isFinite(saved.startedAt)) return saved;
    } catch { /* New session when storage is invalid. */ }
  }
  const session = { sessionId: resume?.sessionId ?? crypto.randomUUID(),
    idempotencyKey: resume?.idempotencyKey ?? crypto.randomUUID(), startedAt: Date.now(), versionId };
  try { storage?.setItem(key, JSON.stringify(session)); } catch { /* Memory identity still supports retries. */ }
  return session;
}
