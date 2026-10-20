import type { FastifyInstance } from "fastify";
import { parcStock, sawnInventory, stockSummary } from "../stock.js";

// Stock général — tous contrats confondus par défaut. `?contractId=` ne sert
// qu'aux vues par contrat (fiche contrat) ; la page Stock n'en envoie pas.
type Q = { Querystring: { contractId?: string } };

export async function stockRoutes(app: FastifyInstance) {
  app.get<Q>("/stock/summary", async (req) => stockSummary(req.query.contractId));

  app.get<Q>("/stock/sawn-inventory", async (req) => sawnInventory(req.query.contractId));

  app.get<Q>("/stock/parc", async (req) => (await parcStock(req.query.contractId)).rows);
}
