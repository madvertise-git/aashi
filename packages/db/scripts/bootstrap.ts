// One-off database setup, run with an administrator connection. Safe to run
// again: it creates what is missing and resets the role passwords to the ones
// given. Locally it uses the development passwords; in the cloud the deploy
// pipeline passes real ones from Secrets Manager.
//
// The roles (see ADR 0001 and ADR 0002):
//   platform_owner      owns the tables and runs migrations. Nothing else.
//   platform_app        everyday use by the API. Cannot bypass row-level security.
//   platform_auth       the sign-in engine only: the sign-in tables and nothing else.
//   platform_breakglass audited emergencies only. Login stays off until one is declared.
//   platform_resolver   owns the few look-ups that must run before a tenant is known.
//                       Nobody can log in as it.
import pg from "pg";

const production = process.env.NODE_ENV === "production";
function need(name: string, devDefault: string): string {
  const value = process.env[name] ?? (production ? undefined : devDefault);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// The administrator connection: one address, or (in the cloud, where the
// password is its own secret) host, user and password separately.
const adminConfig: pg.ClientConfig = process.env.DATABASE_SUPERUSER_PASSWORD
  ? {
      host: need("DATABASE_SUPERUSER_HOST", "localhost"),
      user: need("DATABASE_SUPERUSER_USER", "postgres"),
      password: process.env.DATABASE_SUPERUSER_PASSWORD,
      database: "postgres",
      ssl: production,
    }
  : { connectionString: need("DATABASE_SUPERUSER_URL", "postgres://postgres:postgres@localhost:5432/postgres") };
const databases = (process.env.BOOTSTRAP_DATABASES ?? "aashi,aashi_test").split(",").map((d) => d.trim()).filter(Boolean);
const logins: [role: string, password: string][] = [
  ["platform_owner", need("PLATFORM_OWNER_PASSWORD", "owner_dev_password")],
  ["platform_app", need("PLATFORM_APP_PASSWORD", "app_dev_password")],
  ["platform_auth", need("PLATFORM_AUTH_PASSWORD", "auth_dev_password")],
];

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

const admin = new pg.Client(adminConfig);
await admin.connect();
try {
  const exists = async (role: string) =>
    (await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount === 1;

  for (const [role, password] of logins) {
    const verb = (await exists(role)) ? "ALTER" : "CREATE";
    await admin.query(`${verb} ROLE ${ident(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOBYPASSRLS`);
  }
  for (const role of ["platform_breakglass", "platform_resolver"]) {
    if (!(await exists(role))) await admin.query(`CREATE ROLE ${ident(role)} NOLOGIN BYPASSRLS`);
  }
  // Lets migrations hand the look-up functions over to platform_resolver.
  // The owner does not inherit the resolver's powers.
  await admin.query("GRANT platform_resolver TO platform_owner WITH INHERIT FALSE, SET TRUE");
  // On managed PostgreSQL the administrator is not a true superuser and must
  // be a member of a role before it can give that role a database.
  await admin.query("GRANT platform_owner TO CURRENT_USER");

  for (const database of databases) {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE ${ident(database)} OWNER platform_owner`);
    else await admin.query(`ALTER DATABASE ${ident(database)} OWNER TO platform_owner`);
  }
  console.log(`Roles ready. Databases ready: ${databases.join(", ")}.`);
} finally {
  await admin.end();
}
