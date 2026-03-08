-- AlterEnum
ALTER TYPE "MagicTokenType" ADD VALUE 'EMAIL_VERIFY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- Backfill: mark all existing users as verified so they aren't locked out
UPDATE "users" SET "email_verified_at" = "created_at";
