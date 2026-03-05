-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "payment_aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
