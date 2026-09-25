import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getAppUrl, getProductName } from "@/lib/config";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "wdth"],
});
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

const description =
  "Build conversational one-question-at-a-time forms, or describe one and let AI draft it in your brand. Share with a link or QR code, collect responses, pay in rupees.";

export const metadata: Metadata = {
  title: {
    default: `${getProductName()} — Forms people actually finish`,
    template: `%s · ${getProductName()}`,
  },
  description,
  metadataBase: new URL(getAppUrl()),
  applicationName: getProductName(),
  openGraph: {
    type: "website",
    siteName: getProductName(),
    title: `${getProductName()} — Forms people actually finish`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${getProductName()} — Forms people actually finish`,
    description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
