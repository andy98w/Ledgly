DROP INDEX IF EXISTS "gmail_connections_org_id_key";
DROP INDEX IF EXISTS "gmail_connections_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "gmail_connections_org_id_email_key" ON "gmail_connections"("org_id", "email");
CREATE INDEX IF NOT EXISTS "gmail_connections_org_id_idx" ON "gmail_connections"("org_id");
