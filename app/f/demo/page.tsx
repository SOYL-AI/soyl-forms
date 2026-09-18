import Link from "next/link";
import { BrandLockup, BrandMark } from "@/components/brand";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { demoForm } from "@/lib/forms/demo";
import { getProductName } from "@/lib/config";

/**
 * Phase 1 exit gate: `/f/demo` must feel polished.
 * Real slugs (`/f/[slug]`) arrive with persistence in Phase 3.
 */
export default function DemoFormPage({
  searchParams,
}: {
  searchParams?: { embed?: string };
}) {
  const embed = searchParams?.embed === "1";
  return (
    <div className="min-h-screen">
      {!embed && (
        <header className="border-b border-ink/10">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
            <BrandLockup compact markSize={24} />
            <span className="rounded-full bg-paper-deep px-3 py-1 text-xs font-semibold text-ink-soft">
              Demo
            </span>
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
        <FormRenderer schema={demoForm} minimal={embed} />
        {!embed && (
          <footer className="mt-12 border-t border-ink/10 pt-5 text-center text-xs leading-relaxed text-ink-faint">
            Demo form — answers stay in your browser and nothing is stored.
            <br />
            <span className="mt-2 inline-flex items-center gap-1.5">
              <BrandMark size={16} />
              Built with {getProductName()}.
            </span>{" "}
            <Link href="/signup" className="font-semibold text-ink-soft underline underline-offset-2">
              Make your own
            </Link>
          </footer>
        )}
      </main>
    </div>
  );
}
