import pg from "pg";

/**
 * Names of tables that are missing row-level security, or have it enabled but
 * not forced. The build fails if this is not empty.
 */
export async function tablesWithoutForcedRls(connectionString: string): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(`
      SELECT n.nspname || '.' || c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'drizzle')
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
      ORDER BY 1`);
    return rows.map((r) => r.name);
  } finally {
    await client.end();
  }
}
