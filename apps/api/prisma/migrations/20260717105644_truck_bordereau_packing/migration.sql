-- AlterTable
ALTER TABLE "truck" ADD COLUMN     "bon_no" TEXT,
ADD COLUMN     "booklet_no" TEXT,
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "driver" TEXT,
ADD COLUMN     "followup_agent" TEXT,
ADD COLUMN     "loaded_at" TIMESTAMP(3),
ADD COLUMN     "sms_code" TEXT,
ADD COLUMN     "trailer" TEXT,
ADD COLUMN     "transporter" TEXT;

-- CreateTable
CREATE TABLE "packing_log" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "bill_no" TEXT,
    "dia_top_cm" DECIMAL(8,2),
    "dia_bottom_cm" DECIMAL(8,2),
    "dia_mean_cm" DECIMAL(8,2),
    "length_m" DECIMAL(8,3),
    "volume_m3" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "packing_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "packing_log" ADD CONSTRAINT "packing_log_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
