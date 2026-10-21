import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
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
