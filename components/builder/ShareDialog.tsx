"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ScanQrButton } from "@/app/dashboard/FormActions";

/**
 * Share dialog: canonical link, QR preview + PNG/SVG downloads, embed snippet.
 * QR encodes `{origin}/f/{slug}?src=qr` — analytics metadata only, same form.
 * Available on all plans, including free.
 */
export function ShareDialog({
  open,
  onClose,
  slug,
  title,
  published,
  justPublishedVersion,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  published: boolean;
  justPublishedVersion?: number | null;
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
    if (!qrUrl || !open) return;
    let live = true;
    QRCode.toString(qrUrl, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 256 })
      .then((s) => {
        if (live) setSvg(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [qrUrl, open]);

  async function downloadPng() {
    if (!qrUrl) return;
    const dataUrl = await QRCode.toDataURL(qrUrl, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
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
    <Dialog
      open={open}
      onClose={onClose}
      title={justPublishedVersion ? "You’re live" : "Share your form"}
      description={
        justPublishedVersion
          ? `Version ${justPublishedVersion} is answering at the link below.`
          : "Link, QR code, or embed — all point at the same live form."
      }
      size="lg"
    >
      {!published && (
        <Notice tone="warn" className="mb-4">
          This form isn’t published yet. The link below will show “unavailable” until you publish.
        </Notice>
      )}

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Public link</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Public form URL"
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-paper-deep/40 px-3 py-2.5 font-mono text-xs"
        />
        <Button onClick={() => copy(url, "link")} disabled={!url}>
          {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === "link" ? "Copied" : "Copy"}
        </Button>
        <ButtonLink href={url || "#"} variant="secondary" target="_blank" rel="noreferrer" aria-label="Open live form">
          <ExternalLink className="h-4 w-4" />
        </ButtonLink>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">QR code</p>
          {svg ? (
            <div
              className="h-36 w-36 overflow-hidden rounded-xl border border-line bg-white p-1"
              dangerouslySetInnerHTML={{ __html: svg }}
              role="img"
              aria-label={`QR code linking to ${qrUrl}`}
            />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center rounded-xl border border-line bg-paper-deep/40 text-xs text-ink-faint">
              Drawing…
            </div>
          )}
        </div>
        <div className="flex flex-col justify-end gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={downloadPng} disabled={!qrUrl}>
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadSvg} disabled={!svg}>
              <Download className="h-3.5 w-3.5" /> SVG
            </Button>
            <ScanQrButton />
          </div>
          <p className="text-xs leading-relaxed text-ink-faint">
            Print it on posters, menus, packaging or a check-in desk. Scans are tagged{" "}
            <code className="font-mono">?src=qr</code> so you can see how many responses came from print.
          </p>
        </div>
      </div>

      <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Embed on your site</p>
      <textarea
        readOnly
        value={embed}
        rows={5}
        aria-label="Embed snippet"
        onFocus={(e) => e.target.select()}
        className="w-full rounded-xl border border-line-strong bg-paper-deep/40 px-3 py-2.5 font-mono text-xs"
      />
      <Button variant="secondary" size="sm" className="mt-2" onClick={() => copy(embed, "embed")} disabled={!embed}>
        {copied === "embed" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied === "embed" ? "Copied" : "Copy snippet"}
      </Button>
    </Dialog>
  );
}
