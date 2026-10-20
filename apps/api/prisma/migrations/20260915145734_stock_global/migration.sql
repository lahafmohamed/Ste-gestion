-- DropForeignKey
ALTER TABLE "container" DROP CONSTRAINT "container_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "production_run" DROP CONSTRAINT "production_run_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "resaw_op" DROP CONSTRAINT "resaw_op_contract_id_fkey";

-- AlterTable
ALTER TABLE "container" ALTER COLUMN "contract_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "production_run" ALTER COLUMN "contract_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "resaw_op" ALTER COLUMN "contract_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "production_run" ADD CONSTRAINT "production_run_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container" ADD CONSTRAINT "container_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resaw_op" ADD CONSTRAINT "resaw_op_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
