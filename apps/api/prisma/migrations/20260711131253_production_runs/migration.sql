-- CreateEnum
CREATE TYPE "SizeGroup" AS ENUM ('MAIN', 'SIDE', 'ONE_INCH', 'OTHER');

-- CreateTable
CREATE TABLE "production_run" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "produced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sawn_line" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "length_ft" DECIMAL(8,3) NOT NULL,
    "width_in" DECIMAL(8,3) NOT NULL,
    "thickness_in" DECIMAL(8,3) NOT NULL,
    "count" INTEGER NOT NULL,
    "size_code" TEXT NOT NULL,
    "size_group" "SizeGroup" NOT NULL,
    "volume_m3" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "sawn_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "production_run" ADD CONSTRAINT "production_run_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sawn_line" ADD CONSTRAINT "sawn_line_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "production_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
