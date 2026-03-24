ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_columns" JSONB DEFAULT '[]';
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB DEFAULT '{}';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB DEFAULT '{}';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB DEFAULT '{}';
