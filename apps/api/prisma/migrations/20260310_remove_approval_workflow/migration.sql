-- Convert existing PENDING records to IGNORED (never acted on)
UPDATE "email_imports" SET "status" = 'IGNORED' WHERE "status" = 'PENDING';

-- Convert existing CONFIRMED records to AUTO_CONFIRMED
UPDATE "email_imports" SET "status" = 'AUTO_CONFIRMED' WHERE "status" = 'CONFIRMED';

-- Drop needs_review_reason column
ALTER TABLE "email_imports" DROP COLUMN IF EXISTS "needs_review_reason";

-- Drop auto_approve columns from organizations
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "auto_approve_payments";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "auto_approve_expenses";

-- Change default for status column
ALTER TABLE "email_imports" ALTER COLUMN "status" SET DEFAULT 'AUTO_CONFIRMED';

-- Recreate enum without PENDING and CONFIRMED
-- Postgres doesn't allow removing values from enums directly,
-- so we create a new enum, migrate the column, then drop the old one.
CREATE TYPE "EmailImportStatus_new" AS ENUM ('AUTO_CONFIRMED', 'IGNORED', 'DUPLICATE');

ALTER TABLE "email_imports"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "EmailImportStatus_new" USING ("status"::text::"EmailImportStatus_new"),
  ALTER COLUMN "status" SET DEFAULT 'AUTO_CONFIRMED';

DROP TYPE "EmailImportStatus";
ALTER TYPE "EmailImportStatus_new" RENAME TO "EmailImportStatus";
