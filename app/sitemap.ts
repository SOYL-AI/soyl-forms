import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/config";
import { TEMPLATES } from "@/lib/forms/templates";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const now = new Date();
  const statics = ["", "/features", "/pricing", "/templates", "/f/demo", "/privacy", "/terms", "/contact", "/signup", "/login"].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: p === "" ? ("weekly" as const) : ("monthly" as const),
    priority: p === "" ? 1 : p === "/pricing" || p === "/templates" ? 0.9 : 0.6,
  }));
  const templates = TEMPLATES.map((t) => ({
    url: `${base}/templates/${t.id}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [...statics, ...templates];
}
