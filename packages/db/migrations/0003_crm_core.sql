-- CRM: companies, tags, notes and custom fields. All of it is client data, so
-- every table carries the agency and the client account, has row-level
-- security forced, and links to its parent with the account in the key.

-- Lets other tables point at (account, contact) together, so a note or a tag
-- can never be attached to a contact in a different client account.
ALTER TABLE contacts ADD CONSTRAINT contacts_account_id_id_key UNIQUE (account_id, id);
--> statement-breakpoint
-- The new unique index covers the same columns.
DROP INDEX contacts_account_id_idx;
--> statement-breakpoint

CREATE TABLE companies (
  id         uuid PRIMARY KEY,
  agency_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  name       text NOT NULL,
  website    text,
  phone      text CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Custom field values, keyed by the field's key. Checked by the API against custom_fields.
  custom     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE
);
--> statement-breakpoint

ALTER TABLE contacts ADD COLUMN company_id uuid;
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN custom jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
-- Deleting a company leaves its people in place, without a company.
ALTER TABLE contacts ADD CONSTRAINT contacts_company_fkey
  FOREIGN KEY (account_id, company_id) REFERENCES companies (account_id, id) ON DELETE SET NULL (company_id);
--> statement-breakpoint
CREATE INDEX contacts_account_company_idx ON contacts (account_id, company_id) WHERE company_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE tags (
  id         uuid PRIMARY KEY,
  agency_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  name       citext NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  -- One tag per name per account, whatever the capitals.
  UNIQUE (account_id, name),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE contact_tags (
  agency_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  tag_id     uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, contact_id, tag_id),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, contact_id) REFERENCES contacts (account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, tag_id) REFERENCES tags (account_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX contact_tags_account_tag_idx ON contact_tags (account_id, tag_id, contact_id);
--> statement-breakpoint

CREATE TABLE notes (
  id         uuid PRIMARY KEY,
  agency_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  -- Kept when the author's user is deleted; the note then has no named author.
  author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, contact_id) REFERENCES contacts (account_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX notes_account_contact_idx ON notes (account_id, contact_id, id);
--> statement-breakpoint

-- The extra fields a client account defines for its contacts or companies.
CREATE TABLE custom_fields (
  id         uuid PRIMARY KEY,
  agency_id  uuid NOT NULL,
  account_id uuid NOT NULL,
  entity     text NOT NULL CHECK (entity IN ('contact', 'company')),
  -- The name used in the `custom` object, e.g. "budget". Never changes once made.
  key        text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label      text NOT NULL,
  type       text NOT NULL CHECK (type IN ('text', 'number', 'date', 'boolean', 'select')),
  -- The choices, for type "select".
  options    jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, entity, key),
  FOREIGN KEY (account_id, agency_id) REFERENCES accounts (id, agency_id) ON DELETE CASCADE
);
--> statement-breakpoint

ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies     FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tags          ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tags          FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contact_tags  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contact_tags  FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notes         ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notes         FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE custom_fields FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Client data needs both the agency and the client account, as contacts do.
CREATE POLICY companies_tenant ON companies FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
CREATE POLICY tags_tenant ON tags FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
CREATE POLICY contact_tags_tenant ON contact_tags FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
CREATE POLICY notes_tenant ON notes FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
CREATE POLICY custom_fields_tenant ON custom_fields FOR ALL
  USING (agency_id = app_agency_id() AND account_id = app_account_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON companies, tags, notes TO platform_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON contact_tags, custom_fields TO platform_app;
