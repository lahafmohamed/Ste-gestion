-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "debited_m3" DECIMAL(12,6) NOT NULL DEFAULT 0,
ADD COLUMN     "export_sizes_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "output_circ_pct" DECIMAL(7,4) NOT NULL DEFAULT 0;
