import { Pool, type PoolClient } from "pg";

const globalDatabase = globalThis as typeof globalThis & { soylDatabasePool?: Pool };

export function getDatabasePool(): Pool {
  if (globalDatabase.soylDatabasePool) return globalDatabase.soylDatabasePool;
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("DATABASE_URL is not configured");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("DATABASE_URL is not a valid PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // pg connection-string SSL options can replace explicit verification settings.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"]) url.searchParams.delete(key);
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: local && process.env.NODE_ENV !== "production" ? false : { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: "soyl-forms",
    allowExitOnIdle: true,
  });
  // Never log raw driver errors: they can include SQL arguments or credentials.
  pool.on("error", () => console.error(JSON.stringify({ event: "database_idle_connection_error" })));
  globalDatabase.soylDatabasePool = pool;
  return pool;
}

/** Trusted identity is transaction-local, including when pooled connections are reused. */
export async function withUserTransaction<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Invalid user identity");
  const client = await getDatabasePool().connect();
  let discard = false;
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try { await client.query("rollback"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
