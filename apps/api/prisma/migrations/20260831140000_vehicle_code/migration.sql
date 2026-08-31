-- Le transporteur et la note quittent la fiche camion. Au portail, un camion
-- s'appelle par son code interne (« STE-01 »), pas par sa société de transport :
-- le bordereau garde son propre champ transporteur, saisi voyage par voyage.
ALTER TABLE "vehicle" DROP COLUMN "transporter",
                      DROP COLUMN "note",
                      ADD COLUMN "code" TEXT;

-- Un code désigne un seul camion. Nullable : une fiche née d'une réception
-- n'en a pas encore, et Postgres laisse coexister autant de NULL qu'il faut.
CREATE UNIQUE INDEX "vehicle_code_key" ON "vehicle"("code");
