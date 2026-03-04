-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'TREASURER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT', 'INVITED', 'PENDING');

-- CreateEnum
CREATE TYPE "ChargeCategory" AS ENUM ('DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "EmailImportStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IGNORED', 'DUPLICATE', 'AUTO_CONFIRMED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('EVENT', 'SUPPLIES', 'FOOD', 'VENUE', 'MARKETING', 'SERVICES', 'OTHER');

-- CreateEnum
CREATE TYPE "MagicTokenType" AS ENUM ('SIGN_IN', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_RECEIVED', 'CHARGE_OVERDUE', 'MEMBER_JOINED', 'EXPENSE_CREATED', 'CHARGE_CREATED', 'SYSTEM');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auto_approve_payments" BOOLEAN NOT NULL DEFAULT true,
    "auto_approve_expenses" BOOLEAN NOT NULL DEFAULT true,
    "enabled_payment_sources" TEXT[] DEFAULT ARRAY['venmo', 'zelle', 'cashapp', 'paypal']::TEXT[],
    "join_code" TEXT,
    "join_code_enabled" BOOLEAN NOT NULL DEFAULT true,
    "join_requires_approval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatar_url" TEXT,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "MagicTokenType" NOT NULL DEFAULT 'SIGN_IN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "event" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "invited_email" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "invite_token" TEXT,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "category" "ChargeCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "ChargeStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "raw_payer_name" TEXT,
    "memo" TEXT,
    "external_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff_json" JSONB,
    "batch_id" TEXT,
    "batch_description" TEXT,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "undone_at" TIMESTAMP(3),
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmail_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "last_history_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_imports" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "gmail_connection_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "email_from" TEXT NOT NULL,
    "email_subject" TEXT NOT NULL,
    "email_date" TIMESTAMP(3) NOT NULL,
    "email_snippet" TEXT,
    "parsed_source" TEXT NOT NULL,
    "parsed_amount" INTEGER,
    "parsed_payer_name" TEXT,
    "parsed_payer_email" TEXT,
    "parsed_memo" TEXT,
    "status" "EmailImportStatus" NOT NULL DEFAULT 'PENDING',
    "payment_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocated_charge_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "derived_category" TEXT,
    "match_confidence" DOUBLE PRECISION,
    "matched_membership_id" TEXT,
    "needs_review_reason" TEXT,
    "expense_id" TEXT,
    "parsed_direction" TEXT NOT NULL DEFAULT 'incoming',
    "matched_expense_id" TEXT,
    "potential_expense_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "email_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "vendor" TEXT,
    "receipt_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_join_code_key" ON "organizations"("join_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "magic_tokens_token_key" ON "magic_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "auth_events_user_id_idx" ON "auth_events"("user_id");

-- CreateIndex
CREATE INDEX "auth_events_event_idx" ON "auth_events"("event");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_invite_token_key" ON "memberships"("invite_token");

-- CreateIndex
CREATE INDEX "memberships_org_id_idx" ON "memberships"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_org_id_user_id_key" ON "memberships"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "charges_org_id_status_idx" ON "charges"("org_id", "status");

-- CreateIndex
CREATE INDEX "charges_membership_id_idx" ON "charges"("membership_id");

-- CreateIndex
CREATE INDEX "payments_org_id_idx" ON "payments"("org_id");

-- CreateIndex
CREATE INDEX "payments_org_id_deleted_at_idx" ON "payments"("org_id", "deleted_at");

-- CreateIndex
CREATE INDEX "payments_org_id_paid_at_deleted_at_idx" ON "payments"("org_id", "paid_at", "deleted_at");

-- CreateIndex
CREATE INDEX "payments_membership_id_idx" ON "payments"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_org_id_external_id_key" ON "payments"("org_id", "external_id");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_charge_id_idx" ON "payment_allocations"("charge_id");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_entity_type_entity_id_idx" ON "audit_logs"("org_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_batch_id_idx" ON "audit_logs"("org_id", "batch_id");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_connections_org_id_key" ON "gmail_connections"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_connections_email_key" ON "gmail_connections"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_imports_payment_id_key" ON "email_imports"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_imports_expense_id_key" ON "email_imports"("expense_id");

-- CreateIndex
CREATE INDEX "email_imports_org_id_status_idx" ON "email_imports"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_imports_gmail_connection_id_message_id_key" ON "email_imports"("gmail_connection_id", "message_id");

-- CreateIndex
CREATE INDEX "expenses_org_id_idx" ON "expenses"("org_id");

-- CreateIndex
CREATE INDEX "expenses_org_id_date_idx" ON "expenses"("org_id", "date");

-- CreateIndex
CREATE INDEX "notifications_org_id_read_idx" ON "notifications"("org_id", "read");

-- CreateIndex
CREATE INDEX "notifications_org_id_created_at_idx" ON "notifications"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_sessions_org_id_updated_at_idx" ON "agent_sessions"("org_id", "updated_at");

-- AddForeignKey
ALTER TABLE "magic_tokens" ADD CONSTRAINT "magic_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_imports" ADD CONSTRAINT "email_imports_gmail_connection_id_fkey" FOREIGN KEY ("gmail_connection_id") REFERENCES "gmail_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
