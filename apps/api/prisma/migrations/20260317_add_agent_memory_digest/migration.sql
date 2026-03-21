CREATE TABLE IF NOT EXISTS "agent_memories" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_memories_org_id_idx" ON "agent_memories"("org_id");

ALTER TABLE "agent_memories" DROP CONSTRAINT IF EXISTS "agent_memories_org_id_fkey";
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
