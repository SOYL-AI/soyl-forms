import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { getProductName, getSupportEmail } from "@/lib/config";

export function SiteFooter() {
  const name = getProductName();
  return (
    <footer className="border-t border-ink/10 bg-paper-deep/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-4">
        <div>
          <p className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="text-base font-bold tracking-tight">{name}</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
            Beautiful one-question-at-a-time forms with simple INR pricing.
            A SOYL AI product.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-sm font-semibold">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li><Link href="/features" className="hover:text-ink">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
            <li><Link href="/f/demo" className="hover:text-ink">Live demo</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="text-sm font-semibold">Account</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li><Link href="/login" className="hover:text-ink">Log in</Link></li>
            <li><Link href="/signup" className="hover:text-ink">Sign up</Link></li>
            <li><Link href="/dashboard" className="hover:text-ink">Dashboard</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold">Support</p>
          <p className="mt-3 text-sm text-ink-soft">
            <a href={`mailto:${getSupportEmail()}`} className="hover:text-ink">
              {getSupportEmail()}
            </a>
          </p>
        </div>
      </div>
      <div className="border-t border-ink/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-ink-faint">
          © {new Date().getFullYear()} SOYL AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
