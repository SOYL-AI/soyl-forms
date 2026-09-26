import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { getProductName, getSupportEmail } from "@/lib/config";

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/templates", label: "Templates" },
      { href: "/pricing", label: "Pricing" },
      { href: "/f/demo", label: "Live demo" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Start free" },
      { href: "/login", label: "Log in" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/billing", label: "Billing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  const name = getProductName();
  return (
    <footer className="border-t border-line bg-paper-deep/40">
      <div className="mx-auto grid max-w-page gap-10 px-5 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="font-display text-base font-semibold tracking-tight">{name}</span>
          </p>
          <p className="mt-4 text-sm">
            <a href={`mailto:${getSupportEmail()}`} className="text-ink-soft hover:text-ink">
              {getSupportEmail()}
            </a>
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{col.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs text-ink-faint sm:px-6">
          <span>© {new Date().getFullYear()} SOYL AI</span>
        </p>
      </div>
    </footer>
  );
}
