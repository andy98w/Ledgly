CREATE TABLE IF NOT EXISTS "announcements" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "announcements_org_id_idx" ON "announcements"("org_id");
CREATE INDEX IF NOT EXISTS "announcements_org_id_created_at_idx" ON "announcements"("org_id", "created_at");

ALTER TABLE "announcements" DROP CONSTRAINT IF EXISTS "announcements_org_id_fkey";
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcements" DROP CONSTRAINT IF EXISTS "announcements_created_by_id_fkey";
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
