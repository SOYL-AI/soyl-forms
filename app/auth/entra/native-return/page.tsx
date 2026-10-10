import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isEntraProofEnabled } from "@/lib/auth/config";
import { EntraNativeReturn } from "@/components/auth/EntraNativeReturn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finishing sign-in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function EntraNativeReturnPage() {
  if (!isEntraProofEnabled()) notFound();
  return <EntraNativeReturn />;
}
