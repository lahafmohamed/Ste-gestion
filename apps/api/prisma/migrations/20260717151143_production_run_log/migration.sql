-- CreateTable
CREATE TABLE "production_run_log" (
    "run_id" TEXT NOT NULL,
    "log_id" TEXT NOT NULL,

    CONSTRAINT "production_run_log_pkey" PRIMARY KEY ("run_id","log_id")
);

-- AddForeignKey
ALTER TABLE "production_run_log" ADD CONSTRAINT "production_run_log_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "production_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_run_log" ADD CONSTRAINT "production_run_log_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
