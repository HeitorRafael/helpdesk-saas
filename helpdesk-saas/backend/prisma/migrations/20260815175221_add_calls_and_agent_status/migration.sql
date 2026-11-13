-- CreateEnum
CREATE TYPE "AgentStatusValue" AS ENUM ('AVAILABLE', 'PAUSED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "handledByUserId" TEXT;

-- CreateTable
CREATE TABLE "agent_status_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentStatusValue" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "agent_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "transferredToUserId" TEXT,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_status_logs_tenantId_userId_idx" ON "agent_status_logs"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "agent_status_logs_tenantId_startedAt_idx" ON "agent_status_logs"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "calls_tenantId_userId_idx" ON "calls"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "calls_tenantId_startedAt_idx" ON "calls"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "calls_clientId_idx" ON "calls"("clientId");

-- CreateIndex
CREATE INDEX "tickets_handledByUserId_idx" ON "tickets"("handledByUserId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_status_logs" ADD CONSTRAINT "agent_status_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_status_logs" ADD CONSTRAINT "agent_status_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_transferredToUserId_fkey" FOREIGN KEY ("transferredToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
