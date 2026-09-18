import type { Metadata } from "next";
import { getProductName } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${getProductName()} — Forms people enjoy answering`,
    template: `%s · ${getProductName()}`,
  },
  description:
    "Create beautiful one-question-at-a-time forms, share them with a link or QR code, and review responses. Simple INR pricing.",
  metadataBase: process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL)
    : undefined,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
