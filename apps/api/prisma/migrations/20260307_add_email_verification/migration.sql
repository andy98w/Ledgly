-- AlterEnum (idempotent)
DO $$ BEGIN
  ALTER TYPE "MagicTokenType" ADD VALUE 'EMAIL_VERIFY';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);

-- Backfill: mark all existing users as verified so they aren't locked out
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
