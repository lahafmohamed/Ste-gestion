-- CreateEnum
CREATE TYPE "ResawLineKind" AS ENUM ('CONSUMED', 'PRODUCED');

-- CreateTable
CREATE TABLE "resaw_op" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "resawn_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resaw_op_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resaw_line" (
    "id" TEXT NOT NULL,
    "op_id" TEXT NOT NULL,
    "kind" "ResawLineKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "length_ft" DECIMAL(8,3) NOT NULL,
    "width_in" DECIMAL(8,3) NOT NULL,
    "thickness_in" DECIMAL(8,3) NOT NULL,
    "count" INTEGER NOT NULL,
    "size_code" TEXT NOT NULL,
    "size_group" "SizeGroup" NOT NULL,
    "volume_m3" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "resaw_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "resaw_op" ADD CONSTRAINT "resaw_op_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resaw_line" ADD CONSTRAINT "resaw_line_op_id_fkey" FOREIGN KEY ("op_id") REFERENCES "resaw_op"("id") ON DELETE CASCADE ON UPDATE CASCADE;
