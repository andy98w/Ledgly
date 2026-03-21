CREATE TABLE IF NOT EXISTS "agent_failure_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_message" TEXT NOT NULL,
    "ai_response" TEXT,
    "error_type" TEXT NOT NULL,
    "tool_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_failure_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_failure_logs_org_id_idx" ON "agent_failure_logs"("org_id");

ALTER TABLE "agent_failure_logs" DROP CONSTRAINT IF EXISTS "agent_failure_logs_org_id_fkey";
ALTER TABLE "agent_failure_logs" ADD CONSTRAINT "agent_failure_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
