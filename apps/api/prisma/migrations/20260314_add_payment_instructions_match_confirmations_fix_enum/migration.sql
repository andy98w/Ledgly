-- AlterTable: add payment_instructions column to organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "payment_instructions" TEXT;

-- CreateEnum: ScheduleFrequency
DO $$ BEGIN
  CREATE TYPE "ScheduleFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: charge_schedules
CREATE TABLE IF NOT EXISTS "charge_schedules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ChargeCategory" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "month_of_year" INTEGER,
    "target_scope" TEXT NOT NULL DEFAULT 'ALL_ACTIVE',
    "target_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "charge_schedules_org_id_is_active_idx"
    ON "charge_schedules"("org_id", "is_active");
CREATE INDEX IF NOT EXISTS "charge_schedules_next_run_at_idx"
    ON "charge_schedules"("next_run_at");

ALTER TABLE "charge_schedules" DROP CONSTRAINT IF EXISTS "charge_schedules_org_id_fkey";
ALTER TABLE "charge_schedules" ADD CONSTRAINT "charge_schedules_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge_schedules" DROP CONSTRAINT IF EXISTS "charge_schedules_created_by_id_fkey";
ALTER TABLE "charge_schedules" ADD CONSTRAINT "charge_schedules_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: reminder_rules
CREATE TABLE IF NOT EXISTS "reminder_rules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "days_offset" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reminder_rules_org_id_is_active_idx"
    ON "reminder_rules"("org_id", "is_active");

ALTER TABLE "reminder_rules" DROP CONSTRAINT IF EXISTS "reminder_rules_org_id_fkey";
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: reminder_logs
CREATE TABLE IF NOT EXISTS "reminder_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient_email" TEXT NOT NULL,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_rule_id_charge_id_key"
      UNIQUE ("rule_id", "charge_id");
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN duplicate_table THEN NULL;
          WHEN OTHERS THEN
            IF SQLERRM LIKE '%already exists%' THEN NULL;
            ELSE RAISE;
            END IF;
END $$;

CREATE INDEX IF NOT EXISTS "reminder_logs_org_id_sent_at_idx"
    ON "reminder_logs"("org_id", "sent_at");

-- CreateTable: match_confirmations
CREATE TABLE IF NOT EXISTS "match_confirmations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "raw_payer_name" TEXT NOT NULL,
    "matched_member_id" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "match_confirmations_org_id_raw_payer_name_idx"
    ON "match_confirmations"("org_id", "raw_payer_name");

-- Fix stale EmailImportStatus enum values (skip if already migrated)
DO $$ BEGIN
  UPDATE "email_imports" SET "status" = 'AUTO_CONFIRMED' WHERE "status" IN ('PENDING', 'CONFIRMED');
EXCEPTION WHEN invalid_text_representation THEN NULL;
END $$;
