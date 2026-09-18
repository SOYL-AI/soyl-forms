import Image from "next/image";
import Link from "next/link";
import { getProductName } from "@/lib/config";
import { cn } from "@/lib/utils";

/** SOYL company mark (black rounded icon, transparent-safe corners). */
export function BrandMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/soyl-mark-sm.png"
      alt="SOYL logo"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-[24%]", className)}
    />
  );
}

/** Mark + product wordmark with the "by SOYL AI" company line. */
export function BrandLockup({
  markSize = 30,
  compact = false,
}: {
  markSize?: number;
  compact?: boolean;
}) {
  const name = getProductName();
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5"
      aria-label={`${name} — home`}
    >
      <BrandMark size={markSize} />
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight">
          {name}
        </span>
        {!compact && (
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            by Soyl AI
          </span>
        )}
      </span>
    </Link>
  );
}
