-- Marque du camion (« RENAULT », « MERCEDES BENZ ») sur la fiche du parc.
-- Texte libre, nullable : descriptif, jamais bloquant à la saisie.
ALTER TABLE "vehicle" ADD COLUMN "brand" TEXT;
