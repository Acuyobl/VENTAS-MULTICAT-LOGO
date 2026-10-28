-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PERSON', 'COMPANY');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "type" "CustomerType" NOT NULL DEFAULT 'PERSON';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMPTZ(3),
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "publicTokenExpiresAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "orders_publicToken_key" ON "orders"("publicToken");
