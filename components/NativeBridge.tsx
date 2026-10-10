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
      const openInApp = (url: string) => {
        const path = inAppPathFor(url, window.location.host);
        if (!path) return;
        sessionStorage.setItem("soyl.native.last-launch-url", url);
        void Browser.close().catch(() => {});
        if (`${window.location.pathname}${window.location.search}${window.location.hash}` === path) return;
        window.location.assign(path);
      };
      const handle = await App.addListener("appUrlOpen", ({ url }) => openInApp(url));
      if (cancelled) { void handle.remove(); return; }
      remove = () => void handle.remove();
      // A process killed while the browser was open receives a cold-start URL.
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (!cancelled && launch?.url && sessionStorage.getItem("soyl.native.last-launch-url") !== launch.url) openInApp(launch.url);
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}
