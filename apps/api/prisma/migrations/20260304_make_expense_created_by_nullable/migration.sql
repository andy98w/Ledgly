-- AlterTable: make expenses.created_by_id nullable for Gmail auto-imports without an admin
ALTER TABLE "expenses" ALTER COLUMN "created_by_id" DROP NOT NULL;
