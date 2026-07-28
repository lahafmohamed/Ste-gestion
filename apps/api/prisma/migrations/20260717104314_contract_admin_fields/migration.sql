-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "duration_months" INTEGER,
ADD COLUMN     "exploitation_start_at" TIMESTAMP(3),
ADD COLUMN     "forest" TEXT,
ADD COLUMN     "management_center" TEXT,
ADD COLUMN     "signed_at" TIMESTAMP(3);
