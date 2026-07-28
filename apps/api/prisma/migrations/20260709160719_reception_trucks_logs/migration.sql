-- CreateEnum
CREATE TYPE "MeasurementContext" AS ENUM ('FIELD', 'YARD_GIRTH', 'YARD_DIAMETER');

-- CreateTable
CREATE TABLE "truck" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "delivery_note" TEXT,
    "parcel" TEXT,
    "origin" TEXT,
    "arrived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_measurement" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "context" "MeasurementContext" NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log" (
    "id" TEXT NOT NULL,
    "measurement_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "external_id" TEXT,
    "length_m" DECIMAL(8,3),
    "length_ft" DECIMAL(8,3),
    "diameter_in" DECIMAL(8,3),
    "circumference_cm" DECIMAL(8,2),
    "volume_m3" DECIMAL(12,6) NOT NULL,
    "cft" DECIMAL(12,4),

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "truck" ADD CONSTRAINT "truck_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_measurement" ADD CONSTRAINT "log_measurement_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "log_measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
