/** Keep driver SQL/arguments out of existing user-facing error paths. */
export async function databaseResult<T>(operation: Promise<T>): Promise<{ data: T | null; error: { message: string } | null }> {
  try { return { data: await operation, error: null }; }
  catch (error) {
    const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error(JSON.stringify({ event: "database_operation_failed", code: /^[A-Z0-9]{5}$/.test(raw) ? raw : "unknown" }));
    return { data: null, error: { message: "The service is temporarily unavailable. Please try again." } };
  }
}
