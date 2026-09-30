/**
 * Next.js caches server-side fetch() by default, and supabase-js reads through
 * fetch. Without this, pages could serve stale rows — e.g. an old published
 * version of a form after it was re-published. Database reads are always live.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });
