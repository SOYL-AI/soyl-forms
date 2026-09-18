import Link from "next/link";
import { BrandLockup } from "@/components/brand";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <BrandLockup />
        <nav aria-label="Primary" className="hidden items-center gap-7 text-sm font-medium text-ink-soft sm:flex">
          <Link href="/features" className="transition-colors hover:text-ink">
            Features
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-ink">
            Pricing
          </Link>
          <Link href="/f/demo" className="transition-colors hover:text-ink">
            Live demo
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-xl2 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl2 bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            Sign up free
          </Link>
        </div>
      </div>
    </header>
  );
}
