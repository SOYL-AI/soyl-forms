import { ImageResponse } from "next/og";
import { getProductName } from "@/lib/config";

export const runtime = "edge";
export const alt = "SOYL Forms — Forms people actually finish";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const name = getProductName();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#101012",
          color: "#f4f3ee",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 600 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#f4f3ee" }} />
          {name}
          <span style={{ color: "#8e8b84", fontWeight: 400 }}>by SOYL AI</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
            Forms people
            <br />
            actually finish.
          </div>
          <div style={{ fontSize: 30, color: "#aba89f", maxWidth: 900, lineHeight: 1.35 }}>
            One question at a time. Drafted by AI in your brand. Shared by link or QR. Priced in rupees.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ padding: "14px 28px", borderRadius: 999, background: "#f2b418", color: "#1a1400", fontSize: 26, fontWeight: 700 }}>
            Start free
          </div>
          <div style={{ fontSize: 24, color: "#8e8b84" }}>Upgrade from ₹199/mo</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
