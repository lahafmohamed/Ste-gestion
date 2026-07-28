-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('SUPPLIER', 'TRANSPORTER', 'CLIENT', 'INTERNAL', 'TAX_AUTHORITY', 'OTHER');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('DUE', 'PAID');

-- CreateTable
CREATE TABLE "party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartyType" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_entry" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "party_name_key" ON "party"("name");

-- AddForeignKey
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
