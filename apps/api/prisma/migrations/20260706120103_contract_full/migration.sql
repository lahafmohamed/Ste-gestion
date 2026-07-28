/*
  Warnings:

  - You are about to drop the column `reforestation_fee` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `used_m3` on the `contract` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contract" DROP COLUMN "reforestation_fee",
DROP COLUMN "used_m3",
ADD COLUMN     "company_budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "company_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost_ibrahim" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost_other" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost_reforestation" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost_sodefor_plus" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost_sodefor_r" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost_transport" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cubage_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expected_profit" DECIMAL(18,2),
ADD COLUMN     "export_budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "export_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ibrahim_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "one_inch_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "piece_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "selling_price_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sodefor_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transport_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "trucks_entered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trucks_on_parc_uncut" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trucks_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usd_cfa_rate" DECIMAL(10,4) NOT NULL DEFAULT 0,
ADD COLUMN     "wood_budget" DECIMAL(18,2) NOT NULL DEFAULT 0;
