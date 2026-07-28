-- CreateTable
CREATE TABLE "container_truck" (
    "container_id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,

    CONSTRAINT "container_truck_pkey" PRIMARY KEY ("container_id","truck_id")
);

-- AddForeignKey
ALTER TABLE "container_truck" ADD CONSTRAINT "container_truck_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_truck" ADD CONSTRAINT "container_truck_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
