-- CreateTable
CREATE TABLE "plaid_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "institution_name" TEXT,
    "account_mask" TEXT,
    "account_name" TEXT,
    "cursor" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plaid_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plaid_connections_org_id_idx" ON "plaid_connections"("org_id");

-- AddForeignKey
ALTER TABLE "plaid_connections" ADD CONSTRAINT "plaid_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
