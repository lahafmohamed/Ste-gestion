import type { FastifyInstance } from "fastify";
import type { ParcOverviewDTO, ParcQueueTruckDTO } from "@ste/shared";
import { prisma } from "../prisma.js";
import { parcStock } from "../stock.js";

export async function dashboardRoutes(app: FastifyInstance) {
  // Où en sont les camions du parc, tous contrats confondus. Trois requêtes
  // légères (pas de billes) : la liste /trucks, elle, embarque chaque relevé
  // ligne par ligne — trop lourd pour l'écran d'accueil.
  app.get("/dashboard/parc", async (): Promise<ParcOverviewDTO> => {
    const [trucks, measurements, parc] = await Promise.all([
      prisma.truck.findMany({
        orderBy: { arrivedAt: "asc" },
        select: {
          id: true,
          contractId: true,
          registration: true,
          deliveryNote: true,
          arrivedAt: true,
          declaredLogCount: true,
          declaredFieldM3: true,
          contract: { select: { code: true, status: true } },
          _count: { select: { productionRuns: true } },
        },
      }),
      prisma.logMeasurement.findMany({
        where: { context: { in: ["YARD_DIAMETER", "YARD_GIRTH"] } },
        select: { truckId: true, context: true },
      }),
      parcStock(),
    ]);

    const hasDia = new Set<string>();
    const hasGirth = new Set<string>();
    for (const m of measurements) {
      (m.context === "YARD_GIRTH" ? hasGirth : hasDia).add(m.truckId);
    }

    // Même règle que la file de l'étalage (parcStage côté web) : billonné =
    // terminé pour le parc ; sinon étalé = à billonner ; sinon à étaler.
    // Écartés : le camion déjà passé à la scie sans relevé (sessions
    // historiques « camion entier »), et ceux d'un contrat clôturé — l'API y
    // refuse tout relevé, ils resteraient « à étaler » pour toujours.
    const queue: ParcQueueTruckDTO[] = [];
    let toSpread = 0;
    let toBuck = 0;
    for (const t of trucks) {
      if (hasGirth.has(t.id)) continue;
      if (t._count.productionRuns > 0) continue;
      if (t.contract.status !== "OPEN") continue;
      const stage = hasDia.has(t.id) ? "A_BILLONNER" : "A_ETALER";
      if (stage === "A_ETALER") toSpread += 1;
      else toBuck += 1;
      queue.push({
        truckId: t.id,
        contractId: t.contractId,
        contractCode: t.contract.code,
        registration: t.registration,
        deliveryNote: t.deliveryNote,
        arrivedAt: t.arrivedAt.toISOString(),
        declaredLogCount: t.declaredLogCount,
        declaredFieldM3: t.declaredFieldM3 != null ? t.declaredFieldM3.toString() : null,
        stage,
      });
    }

    // À scier : les camions qui ont encore des billons au parc — le stock
    // général, quel que soit le contrat (le débitage ne choisit pas de contrat).
    const toSaw = parc.rows.length;
    return {
      trucksOnParc: toSpread + toBuck + toSaw,
      toSpread,
      toBuck,
      toSaw,
      parcM3: parc.totalM3.toFixed(6),
      parcBillons: parc.rows.reduce((s, r) => s + r.billonCount, 0),
      queue,
    };
  });
}
