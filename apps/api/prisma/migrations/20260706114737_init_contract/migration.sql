-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "contract" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER,
    "quota_m3" DECIMAL(12,6) NOT NULL,
    "used_m3" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "reforestation_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_code_key" ON "contract"("code");
