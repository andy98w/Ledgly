-- DropIndex
DROP INDEX IF EXISTS "gmail_connections_org_id_key";

-- DropIndex
DROP INDEX IF EXISTS "gmail_connections_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "gmail_connections_org_id_email_key" ON "gmail_connections"("org_id", "email");

-- CreateIndex
CREATE INDEX "gmail_connections_org_id_idx" ON "gmail_connections"("org_id");
