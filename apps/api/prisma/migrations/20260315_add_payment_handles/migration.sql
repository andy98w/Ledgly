ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "payment_handles" JSONB DEFAULT '{}';
