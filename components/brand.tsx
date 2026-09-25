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
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-[24%]", className)}
      priority={false}
    />
  );
}

/** Mark + product wordmark with the "by SOYL AI" company line. */
export function BrandLockup({
  markSize = 28,
  compact = false,
  href = "/",
}: {
  markSize?: number;
  compact?: boolean;
  href?: string;
}) {
  const name = getProductName();
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={`${name} — home`}>
      <BrandMark size={markSize} />
      <span className="leading-none">
        <span className="block font-display text-[15px] font-semibold tracking-tight">{name}</span>
        {!compact && (
          <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            by SOYL AI
          </span>
        )}
      </span>
    </Link>
  );
}
