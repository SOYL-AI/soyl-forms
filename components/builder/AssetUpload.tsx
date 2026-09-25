"use client";

import { useRef, useState } from "react";
import { ImagePlus, Link2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssetKind = "brand_asset" | "question_media";

/**
 * Upload a creator image (logo, question illustration) to private storage
 * and hand back its public asset URL. Falls back to pasting an https URL
 * when storage isn't connected, so the control always has a working path.
 */
export async function uploadOwnerAsset(
  file: File,
  kind: AssetKind | "brand_source",
  ctx?: { formId?: string; brandKitId?: string },
): Promise<{ ok: true; fileId: string; publicUrl: string | null } | { ok: false; error: string; unavailable?: boolean }> {
  const auth = await fetch("/api/uploads/authorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      ...ctx,
    }),
  });
  const data = (await auth.json().catch(() => null)) as {
    fileId?: string;
    uploadUrl?: string;
    publicUrl?: string | null;
    error?: string;
  } | null;
  if (!auth.ok || !data?.fileId || !data.uploadUrl) {
    return { ok: false, error: data?.error ?? "Upload refused.", unavailable: auth.status === 503 };
  }
  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) return { ok: false, error: "Upload failed — try again." };
  await fetch(`/api/uploads/${data.fileId}/complete`, { method: "POST" }).catch(() => {});
  return { ok: true, fileId: data.fileId, publicUrl: data.publicUrl ?? null };
}

export function AssetUpload({
  value,
  onChange,
  kind,
  formId,
  brandKitId,
  label,
  hint,
  compact,
}: {
  value?: string;
  onChange: (url: string | undefined, fileId?: string) => void;
  kind: AssetKind;
  formId?: string;
  brandKitId?: string;
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadOwnerAsset(file, kind, { formId, brandKitId });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.unavailable) setPasting(true);
      return;
    }
    onChange(res.publicUrl ?? undefined, res.fileId);
  }

  function applyUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      setError("Use a full https:// image URL.");
      return;
    }
    setError(null);
    onChange(trimmed);
    setPasting(false);
    setUrl("");
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-deep/40 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className={cn("rounded-lg bg-paper object-contain", compact ? "h-10 w-16" : "h-16 w-24")}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-soft">{value.replace(/^https?:\/\//, "")}</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="text-xs font-semibold text-ink underline underline-offset-2"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-danger"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : pasting ? (
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/logo.png"
            aria-label={`${label} URL`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyUrl();
              }
            }}
          />
          <button
            type="button"
            onClick={applyUrl}
            className="shrink-0 rounded-xl bg-ink px-3 text-xs font-semibold text-paper"
          >
            Use
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-3 text-xs font-semibold text-ink-soft transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4" />
            {busy ? "Uploading…" : "Upload image"}
          </button>
          <button
            type="button"
            onClick={() => setPasting(true)}
            aria-label="Paste an image URL instead"
            title="Paste an image URL instead"
            className="rounded-xl border border-line-strong px-3 text-ink-soft hover:text-ink"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}
