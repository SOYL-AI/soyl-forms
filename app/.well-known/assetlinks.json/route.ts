import { NextResponse } from "next/server";

/**
 * /.well-known/assetlinks.json — Android App Links Digital Asset Links.
 *
 * Serves the statement list that lets Android verify this domain
 * delegates link handling to the SOYL Forms app (com.soylai.forms).
 *
 * ANDROID_CERT_SHA256 is a comma-separated list of SHA-256 certificate
 * fingerprints (AA:BB:…): the Play App Signing key (Play Console → Test and
 * release → App integrity → App signing) and, for sideloaded test builds, your
 * upload key. See docs/android-release.md.
 *
 * To test: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<your-domain>
 */

const FINGERPRINTS = (process.env.ANDROID_CERT_SHA256 ?? "")
  .split(",")
  .map((f) => f.trim().toUpperCase())
  .filter(Boolean);

export async function GET() {
  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.soylai.forms",
        sha256_cert_fingerprints: FINGERPRINTS,
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
