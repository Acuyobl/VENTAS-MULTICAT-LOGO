-- Gobernanza: presupuesto de IA, aprobaciones y rutinas programadas.

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "RoutineRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "BudgetIncidentKind" AS ENUM ('WARNING', 'HARD_STOP');

-- CreateTable
CREATE TABLE "ai_budget_policies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "monthlyBudgetMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "alertPercent" INTEGER NOT NULL DEFAULT 80,
    "hardStop" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ai_budget_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_budget_incidents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "kind" "BudgetIncidentKind" NOT NULL,
    "spentMicroUsd" INTEGER NOT NULL,
    "limitMicroUsd" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMPTZ(3),
    CONSTRAINT "ai_budget_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" UUID NOT NULL,
    "decidedByUserId" UUID,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "config" JSONB,
    "nextRunAt" TIMESTAMPTZ(3) NOT NULL,
    "lastRunAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_runs" (
    "id" UUID NOT NULL,
    "routineId" UUID NOT NULL,
    "status" "RoutineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "output" JSONB,
    "error" TEXT,
    CONSTRAINT "routine_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_budget_policies_organizationId_key" ON "ai_budget_policies"("organizationId");
CREATE UNIQUE INDEX "ai_budget_incidents_organizationId_period_kind_key" ON "ai_budget_incidents"("organizationId", "period", "kind");
CREATE INDEX "ai_budget_incidents_organizationId_period_idx" ON "ai_budget_incidents"("organizationId", "period");
CREATE INDEX "approval_requests_organizationId_status_createdAt_idx" ON "approval_requests"("organizationId", "status", "createdAt");
CREATE INDEX "approval_requests_entityType_entityId_idx" ON "approval_requests"("entityType", "entityId");
CREATE UNIQUE INDEX "routines_organizationId_key_key" ON "routines"("organizationId", "key");
CREATE INDEX "routines_enabled_nextRunAt_idx" ON "routines"("enabled", "nextRunAt");
CREATE INDEX "routine_runs_routineId_startedAt_idx" ON "routine_runs"("routineId", "startedAt");

-- AddForeignKey
ALTER TABLE "ai_budget_policies" ADD CONSTRAINT "ai_budget_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_budget_incidents" ADD CONSTRAINT "ai_budget_incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routines" ADD CONSTRAINT "routines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
