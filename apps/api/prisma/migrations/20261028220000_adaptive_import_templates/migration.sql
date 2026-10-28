-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "extraFields" JSONB,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'REPLACE',
ADD COLUMN     "proposal" JSONB,
ADD COLUMN     "templateId" UUID;

-- CreateTable
CREATE TABLE "import_mapping_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "catalogId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "headersSignature" TEXT NOT NULL,
    "headers" TEXT[],
    "mapping" JSONB NOT NULL,
    "extraFields" JSONB NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_mapping_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_mapping_templates_organizationId_catalogId_idx" ON "import_mapping_templates"("organizationId", "catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "import_mapping_templates_catalogId_headersSignature_key" ON "import_mapping_templates"("catalogId", "headersSignature");
