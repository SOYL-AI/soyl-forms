"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native";
import { saveFile } from "@/lib/save-file";

/** "Export CSV": a plain download link on the web, the share sheet in the Android app. */
export function ExportCsvButton({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);

  async function exportInApp(e: React.MouseEvent) {
    if (!isNativeApp()) return;
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error();
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "responses.csv";
      await saveFile(fileName, await res.blob());
    } catch {
      window.alert("We couldn't export the responses. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ButtonLink href={href} variant="secondary" onClick={exportInApp} aria-busy={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
    </ButtonLink>
  );
}
