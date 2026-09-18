import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../supabase/migrations");

function readMigration(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
}

/**
 * Regression test for the Phase 2 incident: `createForm` failed with
 * "new row violates row-level security policy" because 0001 defined
 * `editors_write_forms` as FOR ALL ... USING with no WITH CHECK, which
 * PostgreSQL never applies to INSERTs.
 */
describe("RLS migration safety", () => {
  it("0002 drops the broken FOR ALL forms policy", () => {
    const sql = readMigration("0002_fix_forms_rls.sql");
    expect(sql).toContain("editors_write_forms");
    expect(sql).toMatch(/drop policy if exists "editors_write_forms"/i);
  });

  it("every INSERT policy across migrations carries WITH CHECK", () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"));
    const found: string[] = [];
    for (const file of files) {
      const sql = readMigration(file);
      const inserts = sql.match(/for insert\b[^;]*;/gi) ?? [];
      for (const stmt of inserts) {
        found.push(`${file}: ${stmt.slice(0, 60)}`);
        expect(stmt, `${file}: INSERT policy without WITH CHECK`).toMatch(
          /with check/i,
        );
      }
    }
    // 0002 introduced the first INSERT policies; the scan must not be vacuous.
    expect(found.length).toBeGreaterThan(0);
  });

  it("members can read their own membership rows (tenant checks depend on it)", () => {
    const sql = readMigration("0002_fix_forms_rls.sql");
    expect(sql).toMatch(/users_read_own_memberships[\s\S]*auth\.uid\(\) = user_id/i);
  });

  it("forms updates require membership on both USING and WITH CHECK", () => {
    const sql = readMigration("0002_fix_forms_rls.sql");
    const update = sql.match(/create policy "editors_update_forms"[\s\S]*?;/i)?.[0] ?? "";
    expect(update).toMatch(/for update/i);
    expect(update).toMatch(/using \(/i);
    expect(update).toMatch(/with check \(/i);
  });
});
