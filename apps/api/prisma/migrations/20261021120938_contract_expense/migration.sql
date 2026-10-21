-- CreateTable
CREATE TABLE "contract_expense" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_expense_contract_id_idx" ON "contract_expense"("contract_id");

-- AddForeignKey
ALTER TABLE "contract_expense" ADD CONSTRAINT "contract_expense_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
