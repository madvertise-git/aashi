-- Team invites: an agency admin invites someone by email; the person follows a
-- secret link and joins the agency with the role they were offered.
CREATE TABLE invites (
  id          uuid PRIMARY KEY,
  agency_id   uuid NOT NULL REFERENCES agencies (id) ON DELETE CASCADE,
  email       citext NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'member')),
  -- Only the hash of the secret in the link is stored.
  token_hash  text NOT NULL UNIQUE,
  invited_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX invites_agency_id_idx ON invites (agency_id, id);
--> statement-breakpoint
-- One open invite per email per agency.
CREATE UNIQUE INDEX invites_agency_email_open_key ON invites (agency_id, email) WHERE accepted_at IS NULL;
--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invites_tenant ON invites FOR ALL
  USING (agency_id = app_agency_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO platform_app;
--> statement-breakpoint

-- The fourth pre-tenant look-up (ADR 0002): "which open invite does this secret
-- belong to?" Asked before the person is a member, so no tenant can be set.
CREATE FUNCTION auth_invite(p_token_hash text)
RETURNS TABLE (id uuid, agency_id uuid, email text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT i.id, i.agency_id, i.email::text, i.role
  FROM invites i
  WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.expires_at > now()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_invite(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_invite(text) TO platform_app;
--> statement-breakpoint
GRANT SELECT ON invites TO platform_resolver;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO platform_resolver;
--> statement-breakpoint
ALTER FUNCTION auth_invite(text) OWNER TO platform_resolver;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM platform_resolver;
