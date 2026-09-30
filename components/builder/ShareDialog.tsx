"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ScanQrButton } from "@/app/dashboard/FormActions";
import { saveFile } from "@/lib/save-file";

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
    await saveFile(`${slug}-qr.png`, await (await fetch(dataUrl)).blob());
  }

  async function downloadSvg() {
    if (!svg) return;
    await saveFile(`${slug}-qr.svg`, new Blob([svg], { type: "image/svg+xml" }));
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
          ? "Your form is live at the link below."
          : "Share a link, a QR code or an embed. They all open the same form."
      }
      size="lg"
    >
      {!published && (
        <Notice tone="warn" className="mb-4">
          This form isn’t published yet. Publish it to make the link work.
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

      <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">QR code</p>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-paper-deep/30 p-4 sm:flex-row sm:gap-6">
        {svg ? (
          <div
            className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
            role="img"
            aria-label={`QR code linking to ${url}`}
          />
        ) : (
          <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-xl border border-line bg-paper-deep/40 text-xs text-ink-faint">
            Loading…
          </div>
        )}
        <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
          <p className="text-sm leading-relaxed text-ink-soft">
            Print it on posters, menus or packaging. Responses from scans appear as “From QR” in your results.
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button variant="secondary" size="sm" onClick={downloadPng} disabled={!qrUrl}>
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadSvg} disabled={!svg}>
              <Download className="h-3.5 w-3.5" /> SVG
            </Button>
            <ScanQrButton />
          </div>
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
