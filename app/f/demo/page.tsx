import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { demoForm } from "@/lib/forms/demo";
import { THEME_PRESETS } from "@/lib/forms/themes";
import { getProductName } from "@/lib/config";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Answer a real one-question-at-a-time form. Nothing is stored.",
};

const theme = THEME_PRESETS.find((p) => p.id === "forest")?.theme;

export default function DemoFormPage({ searchParams }: { searchParams?: { embed?: string } }) {
  const embed = searchParams?.embed === "1";
  return (
    <div className="flex min-h-[100svh] flex-col" style={{ background: theme?.background, color: theme?.text }}>
      {!embed && (
        <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <BrandMark size={24} /> {getProductName()}
          </Link>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "color-mix(in srgb, currentColor 8%, transparent)" }}
          >
            Demo · nothing is saved
          </span>
        </header>
      )}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-10">
        <FormRenderer schema={demoForm} theme={theme} minimal={embed} preview />
      </main>
      {!embed && (
        <footer className="pb-6 text-center text-xs">
          <Link href="/signup" className="font-semibold underline underline-offset-4 opacity-70 hover:opacity-100">
            Make your own — free
          </Link>
        </footer>
      )}
    </div>
  );
}
