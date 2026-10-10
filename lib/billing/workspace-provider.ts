import "server-only";
import type Razorpay from "razorpay";
import { createRazorpay } from "./razorpay";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/secrets";
import { isAzureBackend } from "@/lib/backend";
import { paymentProvider } from "@/lib/db/repositories/payments";
import { databaseResult } from "@/lib/db/result";

/** Decrypted workspace client, or null when not connected. Never leaves the server. */
export async function getWorkspaceRazorpay(workspaceId: string,formId:string): Promise<{
  client: Razorpay;
  keyId: string;
  mode: "test" | "live";
  keySecret: string;
} | null> {
  const admin = getServiceSupabase();
  if (!isAzureBackend() && !admin) return null;
  const { data } = isAzureBackend() ? await databaseResult(paymentProvider(workspaceId,formId)) : await admin!
    .from("workspace_payment_providers")
    .select("key_id, secret_encrypted, mode, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const row = data as { key_id: string; secret_encrypted: string; mode: string; status: string } | null;
  if (!row || row.status !== "active") return null;
  let secret: string;
  try {
    secret = decryptSecret(row.secret_encrypted);
  } catch {
    return null;
  }
  const mode = row.mode === "live" ? "live" : "test";
  const client = createRazorpay(row.key_id,secret);
  return { client, keyId: row.key_id, mode, keySecret: secret };
}
