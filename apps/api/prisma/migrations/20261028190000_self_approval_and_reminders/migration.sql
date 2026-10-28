-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "catalogId" UUID,
    "orderId" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "to" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reminders_organizationId_createdAt_idx" ON "payment_reminders"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_reminders_orderId_createdAt_idx" ON "payment_reminders"("orderId", "createdAt");
