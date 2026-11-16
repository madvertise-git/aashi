-- Pipelines: deals moving across stages. Client data, so every table carries
-- the agency and the client account and has row-level security forced.
CREATE TABLE pipelines (
  id         uuid PRIMARY KEY,
  agency_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE pipeline_stages (
  id          uuid PRIMARY KEY,
  agency_id   uuid NOT NULL,
  account_id  uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  name        text NOT NULL,
  -- Left to right on the board.
  position    integer NOT NULL,
  -- A deal in a "won" or "lost" stage is closed.
  kind        text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  -- Lets a deal point at (account, pipeline, stage) together, so it can never sit in another pipeline's stage.
  UNIQUE (account_id, pipeline_id, id),
  UNIQUE (account_id, pipeline_id, position),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, pipeline_id) REFERENCES pipelines (account_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE deals (
  id          uuid PRIMARY KEY,
  agency_id   uuid NOT NULL,
  account_id  uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  stage_id    uuid NOT NULL,
  contact_id  uuid,
  title       text NOT NULL,
  -- Whole paise or cents, never decimals.
  value_minor bigint NOT NULL DEFAULT 0 CHECK (value_minor >= 0),
  currency    text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  -- Top to bottom within a stage. Fractions allow dropping a deal between two others.
  position    double precision NOT NULL,
  -- Set when the deal enters a won or lost stage, cleared if it is reopened.
  closed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, pipeline_id, stage_id) REFERENCES pipeline_stages (account_id, pipeline_id, id) ON DELETE CASCADE,
  -- Deleting a contact keeps the deal, without a contact.
  FOREIGN KEY (account_id, contact_id) REFERENCES contacts (account_id, id) ON DELETE SET NULL (contact_id)
);
--> statement-breakpoint
CREATE INDEX deals_board_idx ON deals (account_id, pipeline_id, stage_id, position);
--> statement-breakpoint
CREATE INDEX deals_contact_idx ON deals (account_id, contact_id) WHERE contact_id IS NOT NULL;
--> statement-breakpoint
-- The dashboard counts recent contacts by day.
CREATE INDEX contacts_account_created_idx ON contacts (account_id, created_at);
--> statement-breakpoint

ALTER TABLE pipelines       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pipelines       FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE deals           ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE deals           FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pipelines_tenant ON pipelines FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
CREATE POLICY pipeline_stages_tenant ON pipeline_stages FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
CREATE POLICY deals_tenant ON deals FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pipelines, pipeline_stages, deals TO platform_app;
