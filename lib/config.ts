/** Centralized branding configuration. Never hard-code the product name in UI. */

export function getProductName(): string {
  return process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || "SOYL Forms";
}

export function getSupportEmail(): string {
  return process.env.SUPPORT_EMAIL?.trim() || "ryan.gomez@soyl.cloud";
}

export function getAppUrl(): string {
  const raw =
    (typeof window === "undefined" ? process.env.APP_ORIGIN?.trim() || process.env.ENTRA_APP_ORIGIN?.trim() : undefined) ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
