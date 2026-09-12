CREATE TABLE "payment_requests" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_requests_org_id_fkey" FOREIGN KEY ("org_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_requests_org_id_request_key_key" ON "payment_requests"("org_id", "request_key");
