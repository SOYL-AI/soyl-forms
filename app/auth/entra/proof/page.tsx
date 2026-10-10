import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isEntraProofEnabled } from "@/lib/auth/config";
import { getEntraSessionUser } from "@/lib/auth/session";
import { EntraProofSignIn } from "@/components/auth/EntraProof";
import { getProductName } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign-in verification", robots: { index: false, follow: false } };

export default async function EntraProofPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isEntraProofEnabled()) notFound();
  let unavailable = false;
  const user = await getEntraSessionUser().catch(() => { unavailable = true; return null; });
  const input = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
    <section className="w-full space-y-6 rounded-2xl border border-slate-200 p-8 dark:border-slate-800">
      <p className="text-sm font-medium">{getProductName()}</p>
      <h1 className="text-3xl font-semibold">Sign-in verification</h1>
      {input.error && <p role="alert">Sign-in could not be completed. Please try again.</p>}
      {unavailable && <p role="alert">Sign-in is temporarily unavailable. Please try again shortly.</p>}
      {user ? <>
        <p>You are signed in as {user.display_name || user.email || "a SOYL Forms customer"}.</p>
        <form action="/auth/entra/logout" method="post">
          <button className="rounded-lg border px-5 py-3" type="submit">Sign out</button>
        </form>
      </> : <>
        <p>Sign in or create an account to verify the new SOYL Forms login.</p>
        <EntraProofSignIn />
      </>}
    </section>
  </main>;
}
