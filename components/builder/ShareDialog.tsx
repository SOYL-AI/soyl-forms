"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Share dialog: canonical link, QR preview + PNG/SVG downloads, embed snippet.
 * QR encodes `{origin}/f/{slug}?src=qr` — analytics metadata only, same form.
 * Available on all plans, including free.
 */
export function ShareDialog({
  slug,
  title,
  onClose,
}: {
  slug: string;
  title: string;
  onClose: () => void;
}) {
  const [origin, setOrigin] = useState("");
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  const url = origin ? `${origin}/f/${slug}` : "";
  const qrUrl = url ? `${url}?src=qr` : "";
  const embed = url
    ? `<iframe\n  src="${url}?embed=1"\n  width="100%"\n  height="640"\n  frameborder="0"\n  loading="lazy"\n  title="${title.replace(/"/g, "")}"\n></iframe>`
    : "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!qrUrl) return;
    let live = true;
    QRCode.toString(qrUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
    })
      .then((s) => {
        if (live) setSvg(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [qrUrl]);

  async function downloadPng() {
    if (!qrUrl) return;
    const dataUrl = await QRCode.toDataURL(qrUrl, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${slug}-qr.png`;
    a.click();
  }

  function downloadSvg() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-qr.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function copy(text: string, which: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — the readonly field is selectable */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-tight">Share your form</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Link, QR code, or embed — all live the moment you publish.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-ink/5"
          >
            ✕
          </button>
        </div>

        <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Public link
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            aria-label="Public form URL"
            onFocus={(e) => e.target.select()}
            placeholder="Publishing sets the link…"
            className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={!url}
            onClick={() => copy(url, "link")}
            className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {copied === "link" ? "Copied ✓" : "Copy"}
          </button>
        </div>

        <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          QR code
        </p>
        <div className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-paper p-4">
          {svg ? (
            <div
              className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-white p-1"
              dangerouslySetInnerHTML={{ __html: svg }}
              role="img"
              aria-label={`QR code linking to ${qrUrl}`}
            />
          ) : (
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-white text-xs text-ink-faint">
              {url ? "Drawing…" : "Publish first"}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!qrUrl}
              onClick={downloadPng}
              className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30 disabled:opacity-50"
            >
              Download PNG
            </button>
            <button
              type="button"
              disabled={!svg}
              onClick={downloadSvg}
              className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30 disabled:opacity-50"
            >
              Download SVG
            </button>
            <p className="text-[11px] leading-snug text-ink-faint">
              Scans to the same form; visits tagged <code>?src=qr</code>.
            </p>
          </div>
        </div>

        <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Embed
        </p>
        <textarea
          readOnly
          value={embed}
          rows={5}
          aria-label="Embed snippet"
          onFocus={(e) => e.target.select()}
          className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 font-mono text-xs"
        />
        <button
          type="button"
          disabled={!embed}
          onClick={() => copy(embed, "embed")}
          className="mt-2 rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30 disabled:opacity-50"
        >
          {copied === "embed" ? "Copied ✓" : "Copy snippet"}
        </button>
      </div>
    </div>
  );
}
