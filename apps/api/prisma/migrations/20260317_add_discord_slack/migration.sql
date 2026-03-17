-- CreateTable
CREATE TABLE "discord_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "channel_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "channel_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discord_connections_org_id_idx" ON "discord_connections"("org_id");

-- CreateIndex
CREATE INDEX "slack_connections_org_id_idx" ON "slack_connections"("org_id");

-- AddForeignKey
ALTER TABLE "discord_connections" ADD CONSTRAINT "discord_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
