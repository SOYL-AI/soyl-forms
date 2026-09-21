import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup, BrandMark } from "@/components/brand";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { demoForm } from "@/lib/forms/demo";
import { THEME_PRESETS } from "@/lib/forms/themes";
import { getProductName } from "@/lib/config";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Answer a real one-question-at-a-time form. Nothing is stored.",
};

const theme = THEME_PRESETS.find((p) => p.id === "forest")?.theme;

export default function DemoFormPage({ searchParams }: { searchParams?: { embed?: string } }) {
  const embed = searchParams?.embed === "1";
  return (
    <div className="min-h-screen" style={{ background: theme?.background, color: theme?.text }}>
      {!embed && (
        <header className="border-b border-black/10">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
            <BrandLockup compact markSize={24} />
            <Badge tone="neutral">Demo · nothing is stored</Badge>
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
        <FormRenderer schema={demoForm} theme={theme} minimal={embed} preview />
        {!embed && (
          <footer className="mt-12 border-t border-black/10 pt-5 text-center text-xs leading-relaxed opacity-70">
            <span className="inline-flex items-center gap-1.5">
              <BrandMark size={16} />
              Built with {getProductName()}.
            </span>{" "}
            <Link href="/signup" className="font-semibold underline underline-offset-2">
              Make your own — free
            </Link>
          </footer>
        )}
      </main>
    </div>
  );
}
