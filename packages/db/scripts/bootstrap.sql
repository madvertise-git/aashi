-- One-off setup, run by a superuser (locally: docker-compose does it on first start;
-- in the cloud: infrastructure code does the same with real secrets).
-- Safe to run again. The passwords here are for local development only.
--
-- The three roles from the engineering plan, plus one narrow helper:
--   platform_owner      owns the tables and runs migrations. Nothing else.
--   platform_app        everyday use by the API. Cannot bypass row-level security.
--   platform_breakglass audited emergencies only. Login stays off until one is declared.
--   platform_resolver   owns three small look-up functions that must run before a
--                       tenant is known (sign-in, session check, account access).
--                       Nobody can log in as it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_owner') THEN
    CREATE ROLE platform_owner LOGIN PASSWORD 'owner_dev_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_app') THEN
    CREATE ROLE platform_app LOGIN PASSWORD 'app_dev_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_breakglass') THEN
    CREATE ROLE platform_breakglass NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_resolver') THEN
    CREATE ROLE platform_resolver NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Lets migrations hand the look-up functions over to platform_resolver.
-- The owner does not inherit the resolver's powers.
GRANT platform_resolver TO platform_owner WITH INHERIT FALSE, SET TRUE;

SELECT 'CREATE DATABASE aashi OWNER platform_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aashi')\gexec

SELECT 'CREATE DATABASE aashi_test OWNER platform_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aashi_test')\gexec
