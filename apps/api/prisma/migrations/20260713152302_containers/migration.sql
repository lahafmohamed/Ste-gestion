-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('PLANNED', 'LOADING', 'LOADED', 'SHIPPED');

-- CreateTable
CREATE TABLE "container" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "client_id" TEXT,
    "container_no" TEXT NOT NULL,
    "seal_no" TEXT,
    "booking_no" TEXT,
    "grade" TEXT,
    "status" "ContainerStatus" NOT NULL DEFAULT 'PLANNED',
    "loaded_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_item" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "length_ft" DECIMAL(8,3) NOT NULL,
    "width_in" DECIMAL(8,3) NOT NULL,
    "thickness_in" DECIMAL(8,3) NOT NULL,
    "count" INTEGER NOT NULL,
    "size_code" TEXT NOT NULL,
    "size_group" "SizeGroup" NOT NULL,
    "volume_m3" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "container_item_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "container" ADD CONSTRAINT "container_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container" ADD CONSTRAINT "container_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_item" ADD CONSTRAINT "container_item_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container"("id") ON DELETE CASCADE ON UPDATE CASCADE;
