-- CreateEnum
CREATE TYPE "Quality" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('INVENTAIRE', 'LIVRAISON', 'SECHOIR', 'MENUISERIE', 'REJET', 'VENTE');

-- AlterTable
ALTER TABLE "container_item" ADD COLUMN     "quality" "Quality" NOT NULL DEFAULT 'B';

-- AlterTable
ALTER TABLE "resaw_line" ADD COLUMN     "quality" "Quality" NOT NULL DEFAULT 'B';

-- AlterTable
ALTER TABLE "sawn_line" ADD COLUMN     "quality" "Quality" NOT NULL DEFAULT 'B';

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "note" TEXT,
    "source_file" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement_line" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "length_ft" DECIMAL(8,3) NOT NULL,
    "width_in" DECIMAL(8,3) NOT NULL,
    "thickness_in" DECIMAL(8,3) NOT NULL,
    "count" INTEGER NOT NULL,
    "quality" "Quality" NOT NULL DEFAULT 'B',
    "size_code" TEXT NOT NULL,
    "size_group" "SizeGroup" NOT NULL,
    "volume_m3" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "stock_movement_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movement_kind_moved_at_idx" ON "stock_movement"("kind", "moved_at");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement_line" ADD CONSTRAINT "stock_movement_line_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Qualité des pièces déjà empotées : reprise du grade écrit sur le conteneur
-- (« 5X3 C GRADE » → C, « A GRADE » → A), même règle que qualityFromLabel.
UPDATE "container_item" ci SET "quality" = 'A'
FROM "container" c
WHERE ci."container_id" = c."id"
  AND (c."grade" ~* '^\s*A(\s*-?\s*GRADE)?\s*$' OR c."grade" ~* '(^|[\s0-9])A\s*GRADE');

UPDATE "container_item" ci SET "quality" = 'C'
FROM "container" c
WHERE ci."container_id" = c."id"
  AND ci."quality" = 'B'
  AND (c."grade" ~* '(^|[\s0-9X])C(\s*GRADE)?\s*$' OR c."grade" ~* '(^|[^A-Z])C\s*GRADE');

-- Module Stock : « Modifier » = saisir un inventaire, « Exporter » = classeurs
-- STOCK / SUIVI. Source : DEFAULT_ROLE_PERMISSIONS (packages/shared).
INSERT INTO "role_permission" ("role", "permission") VALUES
('SCIERIE', 'stock.edit'),
('SCIERIE', 'stock.export'),
('BUREAU', 'stock.export'),
('PARC', 'stock.export'),
('EXPORT', 'stock.export')
ON CONFLICT DO NOTHING;
