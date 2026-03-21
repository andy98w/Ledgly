ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "notification_templates" JSONB DEFAULT '{}';
