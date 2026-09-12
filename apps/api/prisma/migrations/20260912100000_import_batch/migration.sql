-- Historique des imports Excel réussis.
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "user_id" TEXT,
    "filename" TEXT NOT NULL,
    "sheet_count" INTEGER NOT NULL,
    "line_count" INTEGER NOT NULL,
    "piece_count" INTEGER NOT NULL,
    "total_m3" DECIMAL(14,6) NOT NULL,
    "created_trucks" INTEGER NOT NULL,
    "applied" JSONB NOT NULL,
    "skipped" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_batch_contract_id_created_at_idx" ON "import_batch"("contract_id", "created_at");

ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
