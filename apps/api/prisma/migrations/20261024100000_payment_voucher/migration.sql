-- Bons de paiement : un bon règle, pour un contrat, plusieurs de ses dépenses
-- (postes calculés ou dépenses ajoutées), au montant réellement payé.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'TRANSFER', 'MOBILE_MONEY');

-- CreateTable
CREATE TABLE "payment_voucher" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "contract_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "total" DECIMAL(18,2) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payment" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "key" TEXT,
    "expense_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucher_id" TEXT NOT NULL,

    CONSTRAINT "expense_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_voucher_seq_key" ON "payment_voucher"("seq");
CREATE INDEX "payment_voucher_contract_id_idx" ON "payment_voucher"("contract_id");
CREATE INDEX "expense_payment_contract_id_key_idx" ON "expense_payment"("contract_id", "key");
CREATE INDEX "expense_payment_expense_id_idx" ON "expense_payment"("expense_id");
CREATE INDEX "expense_payment_voucher_id_idx" ON "expense_payment"("voucher_id");

-- AddForeignKey
ALTER TABLE "payment_voucher" ADD CONSTRAINT "payment_voucher_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_voucher" ADD CONSTRAINT "payment_voucher_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_payment" ADD CONSTRAINT "expense_payment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_payment" ADD CONSTRAINT "expense_payment_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "contract_expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_payment" ADD CONSTRAINT "expense_payment_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "payment_voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
