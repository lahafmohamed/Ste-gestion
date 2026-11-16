import "dotenv/config";
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import { APP_NAME } from "@ste/shared";
import { bootstrapAdmin, registerAuth } from "./auth.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { permissionRoutes } from "./routes/permissions.js";
import { contractRoutes } from "./routes/contracts.js";
import { truckRoutes } from "./routes/trucks.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { productionRoutes } from "./routes/production.js";
import { resawRoutes } from "./routes/resaws.js";
import { accountRoutes } from "./routes/accounts.js";
import { expenseRoutes } from "./routes/expenses.js";
import { summaryRoutes } from "./routes/summary.js";
import { stockRoutes } from "./routes/stock.js";
import { saleRoutes } from "./routes/sales.js";
import { containerRoutes } from "./routes/containers.js";
import { reportRoutes } from "./routes/reports.js";
import { exportRoutes } from "./routes/exports.js";
import { importRoutes } from "./routes/imports.js";

const app = Fastify({ logger: true });

// CORS : allowlist via CORS_ORIGIN (séparé par des virgules). En dev, tout est
// permis ; en production sans variable, le cross-origin est refusé (same-origin ok).
const corsOrigin = process.env.CORS_ORIGIN?.trim();
const isProd = process.env.NODE_ENV === "production";
const origin =
  corsOrigin && corsOrigin !== "*"
    ? corsOrigin.split(",").map((s) => s.trim())
    : corsOrigin === "*"
      ? true
      : !isProd;
await app.register(cors, { origin });

// Filet commun aux routes : une erreur Prisma qui remonte sans être captée
// (id inconnu, tiers lié introuvable, valeur hors bornes de la colonne) dit ce
// qui ne va pas en 4xx au lieu d'un 500 ; un vrai 500 est journalisé mais ne
// renvoie jamais le message interne (requête SQL, noms de tables). Le web lit
// toujours `error`.
function prismaError(e: Prisma.PrismaClientKnownRequestError, method: string) {
  switch (e.code) {
    case "P2025":
      return { status: 404, error: "Élément introuvable" };
    case "P2002":
      return { status: 409, error: "Doublon : cette valeur existe déjà" };
    case "P2003":
      return method === "DELETE"
        ? { status: 409, error: "Élément encore utilisé ailleurs — suppression impossible" }
        : { status: 400, error: "Référence invalide : élément lié introuvable" };
    case "P2000":
      return { status: 400, error: "Valeur trop longue pour ce champ" };
    case "P2020":
      return { status: 400, error: "Valeur hors limites pour ce champ" };
    default:
      return null;
  }
}

const HTTP_MSG: Record<number, string> = {
  400: "Requête invalide",
  404: "Route introuvable",
  413: "Requête trop volumineuse",
  415: "Type de contenu non pris en charge",
};

app.setErrorHandler((err: FastifyError, req, reply) => {
  const e = err as unknown;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaError(e, req.method);
    if (mapped) return reply.code(mapped.status).send({ error: mapped.error });
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    req.log.warn(err);
    return reply.code(400).send({ error: "Requête invalide" });
  }
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) {
    req.log.error(err);
    return reply.code(500).send({ error: "Erreur interne du serveur" });
  }
  return reply
    .code(status)
    .send({ error: HTTP_MSG[status] ?? "Requête refusée", message: err.message });
});

await registerAuth(app);

app.get("/health", async () => ({ ok: true, app: APP_NAME }));

await app.register(authRoutes);
await app.register(userRoutes);
await app.register(permissionRoutes);
await app.register(contractRoutes);
await app.register(truckRoutes);
await app.register(vehicleRoutes);
await app.register(productionRoutes);
await app.register(resawRoutes);
await app.register(accountRoutes);
await app.register(expenseRoutes);
await app.register(summaryRoutes);
await app.register(stockRoutes);
await app.register(saleRoutes);
await app.register(containerRoutes);
await app.register(reportRoutes);
await app.register(exportRoutes);
await app.register(importRoutes);

await bootstrapAdmin(app);

const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`API up on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
