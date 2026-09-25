import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Signed-in and respondent routes carry no public value for search.
        disallow: ["/dashboard", "/builder", "/forms", "/billing", "/brand", "/create", "/account", "/super-admin", "/api", "/f/"],
      },
    ],
    sitemap: `${getAppUrl()}/sitemap.xml`,
  };
}
