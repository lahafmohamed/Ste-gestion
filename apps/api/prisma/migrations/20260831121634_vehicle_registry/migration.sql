-- AlterTable
ALTER TABLE "truck" ADD COLUMN     "vehicle_id" TEXT;

-- CreateTable
CREATE TABLE "vehicle" (
    "id" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "plate_key" TEXT NOT NULL,
    "transporter" TEXT,
    "driver" TEXT,
    "trailer" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_plate_key_key" ON "vehicle"("plate_key");

-- AddForeignKey
ALTER TABLE "truck" ADD CONSTRAINT "truck_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Amorçage du parc depuis l'historique : chaque immatriculation déjà reçue
-- devient une fiche camion, et les voyages passés y sont rattachés. Sans ça,
-- la Réception ouvrirait sur une liste vide alors que les camions tournent
-- depuis des mois.
-- Regroupement sur la clé de plaque (majuscules, séparateurs retirés) : deux
-- façons d'écrire la même plaque donnent un seul camion, celui dont l'écriture
-- vient du voyage le plus récent.
INSERT INTO "vehicle" ("id", "registration", "plate_key", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  (ARRAY_AGG("registration" ORDER BY "arrived_at" DESC))[1],
  UPPER(REGEXP_REPLACE("registration", '[^A-Za-z0-9]', '', 'g')),
  NOW(),
  NOW()
FROM "truck"
WHERE UPPER(REGEXP_REPLACE("registration", '[^A-Za-z0-9]', '', 'g')) <> ''
GROUP BY UPPER(REGEXP_REPLACE("registration", '[^A-Za-z0-9]', '', 'g'));

UPDATE "truck" t
SET "vehicle_id" = v."id"
FROM "vehicle" v
WHERE v."plate_key" = UPPER(REGEXP_REPLACE(t."registration", '[^A-Za-z0-9]', '', 'g'));
