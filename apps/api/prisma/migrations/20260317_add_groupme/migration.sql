CREATE TABLE IF NOT EXISTS "groupme_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "group_id" TEXT,
    "group_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "groupme_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "groupme_connections_org_id_idx" ON "groupme_connections"("org_id");

ALTER TABLE "groupme_connections" DROP CONSTRAINT IF EXISTS "groupme_connections_org_id_fkey";
ALTER TABLE "groupme_connections" ADD CONSTRAINT "groupme_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
