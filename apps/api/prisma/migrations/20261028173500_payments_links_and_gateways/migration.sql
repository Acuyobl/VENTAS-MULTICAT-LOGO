-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'SANDBOX';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reference" TEXT;

-- CreateTable
CREATE TABLE "payment_links" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "catalogId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "token" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "mode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT,
    "secretEnc" TEXT,
    "webhookSecretEnc" TEXT,
    "maskedKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_token_key" ON "payment_links"("token");

-- CreateIndex
CREATE INDEX "payment_links_orderId_idx" ON "payment_links"("orderId");

-- CreateIndex
CREATE INDEX "payment_links_organizationId_status_createdAt_idx" ON "payment_links"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_organizationId_provider_key" ON "payment_gateway_configs"("organizationId", "provider");

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
