import { NextResponse } from "next/server";

/**
 * /.well-known/assetlinks.json — Android App Links Digital Asset Links.
 *
 * Serves the statement list that lets Android verify this domain
 * delegates link handling to the SOYL Forms app (com.soylai.forms).
 *
 * The SHA-256 fingerprint comes from Play App Signing (Play Console →
 * Setup → App signing → SHA-256 certificate fingerprint). Update this
 * value after enrolling in Play App Signing.
 *
 * To test: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://forms.soylai.com
 */

const FINGERPRINTS = process.env.ANDROID_CERT_SHA256
  ? [process.env.ANDROID_CERT_SHA256]
  : [];

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
