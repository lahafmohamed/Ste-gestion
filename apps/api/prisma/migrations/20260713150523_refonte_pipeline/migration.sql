/*
  Warnings:

  - You are about to drop the column `cost_ibrahim` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `cost_other` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `cost_reforestation` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `cost_sodefor_plus` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `cost_sodefor_r` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `cost_transport` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `debited_m3` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `export_sizes_cost` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `output_circ_pct` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `piece_count` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `trucks_entered` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `trucks_on_parc_uncut` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `trucks_total` on the `contract` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contract" DROP COLUMN "cost_ibrahim",
DROP COLUMN "cost_other",
DROP COLUMN "cost_reforestation",
DROP COLUMN "cost_sodefor_plus",
DROP COLUMN "cost_sodefor_r",
DROP COLUMN "cost_transport",
DROP COLUMN "debited_m3",
DROP COLUMN "export_sizes_cost",
DROP COLUMN "output_circ_pct",
DROP COLUMN "piece_count",
DROP COLUMN "trucks_entered",
DROP COLUMN "trucks_on_parc_uncut",
DROP COLUMN "trucks_total",
ADD COLUMN     "cubage_party_id" TEXT,
ADD COLUMN     "fee_reforestation" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fee_sodefor_plus" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fee_sodefor_r" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sodefor_party_id" TEXT,
ADD COLUMN     "transport_party_id" TEXT,
ADD COLUMN     "trucks_planned" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "production_run_truck" (
    "run_id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,

    CONSTRAINT "production_run_truck_pkey" PRIMARY KEY ("run_id","truck_id")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "client_id" TEXT,
    "sale_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_note" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "size_code" TEXT NOT NULL,
    "volume_m3" DECIMAL(12,6) NOT NULL,
    "unit_price_usd" DECIMAL(18,2),
    "usd_cfa_rate" DECIMAL(10,4),
    "unit_price_cfa" DECIMAL(18,2),
    "amount_cfa" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_sodefor_party_id_fkey" FOREIGN KEY ("sodefor_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_cubage_party_id_fkey" FOREIGN KEY ("cubage_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_transport_party_id_fkey" FOREIGN KEY ("transport_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_run_truck" ADD CONSTRAINT "production_run_truck_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "production_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_run_truck" ADD CONSTRAINT "production_run_truck_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
