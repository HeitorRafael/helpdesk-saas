-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "cnpj" TEXT;

-- CreateTable
CREATE TABLE "client_attributes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_attributes_tenantId_idx" ON "client_attributes"("tenantId");

-- CreateIndex
CREATE INDEX "client_attributes_clientId_idx" ON "client_attributes"("clientId");

-- AddForeignKey
ALTER TABLE "client_attributes" ADD CONSTRAINT "client_attributes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_attributes" ADD CONSTRAINT "client_attributes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
