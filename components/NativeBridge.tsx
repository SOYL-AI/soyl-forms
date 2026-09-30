"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";
import { inAppPathFor } from "@/lib/native-auth";

/**
 * Android app only: routes URLs the app is opened with (Google sign-in
 * returning from the browser, App Links for forms and email sign-in links)
 * into the WebView. Renders nothing; a no-op on the website.
 */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
      const handle = await App.addListener("appUrlOpen", ({ url }) => {
        const path = inAppPathFor(url, window.location.host);
        if (!path) return;
        void Browser.close().catch(() => {});
        window.location.assign(path);
      });
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}
