"use client";

import { useCallback, useState } from "react";

/**
 * Capacitor-native QR scanner using @capacitor-mlkit/barcode-scanning.
 *
 * Security:
 * - Only auto-navigates to forms.soylai.com/f/* URLs.
 * - Rejects javascript:, data:, intent: and other dangerous schemes.
 * - Unknown payloads are shown as plain text with copy/share.
 */

const ALLOWED_HOST = "forms.soylai.com";
const ALLOWED_PATH_PREFIX = "/f/";
const BLOCKED_SCHEMES = ["javascript:", "data:", "intent:", "blob:", "vbscript:"];

interface ScanResult {
  type: "navigate" | "display";
  value: string;
}

function classifyScanResult(raw: string): ScanResult {
  const trimmed = raw.trim();

  // Block dangerous schemes immediately
  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { type: "display", value: trimmed };
    }
  }

  // Try parsing as URL
  try {
    const url = new URL(trimmed);
    if (
      url.hostname === ALLOWED_HOST &&
      url.pathname.startsWith(ALLOWED_PATH_PREFIX) &&
      url.protocol === "https:"
    ) {
      return { type: "navigate", value: url.pathname + url.search };
    }
  } catch {
    // Not a URL — display as text
  }

  return { type: "display", value: trimmed };
}

export function useQrScanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNative, setIsNative] = useState<boolean | null>(null);

  const checkNative = useCallback(async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const native = Capacitor.isNativePlatform();
      setIsNative(native);
      return native;
    } catch {
      setIsNative(false);
      return false;
    }
  }, []);

  const startScan = useCallback(async () => {
    setError(null);
    setResult(null);

    try {
      const native = await checkNative();
      if (!native) {
        setError("QR scanning is available in the SOYL Forms Android app.");
        return;
      }

      const { BarcodeScanner, BarcodeFormat } = await import(
        "@capacitor-mlkit/barcode-scanning"
      );

      // Check and request camera permission
      const permStatus = await BarcodeScanner.checkPermissions();
      if (permStatus.camera === "denied") {
        setError(
          "Camera permission was denied. Please enable it in your device settings to scan QR codes.",
        );
        return;
      }

      if (permStatus.camera !== "granted") {
        const requested = await BarcodeScanner.requestPermissions();
        if (requested.camera !== "granted") {
          setError(
            "Camera permission is required to scan QR codes. You can enable it in Settings → Apps → SOYL Forms → Permissions.",
          );
          return;
        }
      }

      setScanning(true);

      const scanResult = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
      });

      setScanning(false);

      if (scanResult.barcodes.length > 0) {
        const barcode = scanResult.barcodes[0];
        const value = barcode.rawValue ?? barcode.displayValue ?? "";
        if (!value) {
          setError("Could not read the QR code. Try again with better lighting.");
          return;
        }
        const classified = classifyScanResult(value);
        setResult(classified);

        if (classified.type === "navigate") {
          // Navigate in-app
          window.location.href = classified.value;
        }
      } else {
        setError("No QR code detected. Point your camera at a QR code and try again.");
      }
    } catch (err) {
      setScanning(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("canceled") || msg.includes("cancelled")) {
        // User cancelled — not an error
        return;
      }
      setError(`Scan failed: ${msg}`);
    }
  }, [checkNative]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { scanning, result, error, isNative, startScan, clearResult };
}

/** Copy text to clipboard, returns true on success. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Result display for non-navigable QR scans.
 * Shows the scanned value with copy and share actions.
 */
export function QrScanResult({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text: value });
      } catch {
        // User cancelled share
      }
    } else {
      await handleCopy();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="QR scan result"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold tracking-tight">
          QR Code Content
        </h3>
        <p className="mt-1 text-xs text-ink-soft">
          This QR code doesn&apos;t link to a SOYL form. Here&apos;s what it
          contains:
        </p>
        <div className="mt-4 rounded-xl border border-ink/10 bg-paper p-3">
          <p className="break-all text-sm font-mono">{value}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 rounded-full bg-ink px-4 py-2.5 text-xs font-semibold text-white"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-xs font-semibold hover:border-ink/30"
          >
            Share
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-2.5 text-xs font-semibold text-ink-soft hover:bg-ink/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Export classifier for testing
export { classifyScanResult };
