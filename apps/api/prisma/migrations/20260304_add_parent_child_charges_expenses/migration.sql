-- AlterTable
ALTER TABLE "charges" ADD COLUMN     "parent_id" TEXT,
ALTER COLUMN "membership_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "parent_id" TEXT;

-- CreateIndex
CREATE INDEX "charges_parent_id_idx" ON "charges"("parent_id");

-- CreateIndex
CREATE INDEX "expenses_parent_id_idx" ON "expenses"("parent_id");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
