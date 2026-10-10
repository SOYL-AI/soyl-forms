/** Build-time provider selection. The existing production build stays on Supabase
 * until an Azure build passes full acceptance and is deliberately deployed. */
export function isAzureBackend(): boolean {
  return process.env.NEXT_PUBLIC_BACKEND === "azure";
}
export function isApplicationConfigured(): boolean {
  return isAzureBackend() || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
