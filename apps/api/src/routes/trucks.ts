import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  M3_TO_CFT,
  measurementCreateSchema,
  packingCreateSchema,
  truckCreateSchema,
  truckUpdateSchema,
  volumeDiameterM3,
  volumeGirthM3,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen, ensureTruckContractOpen } from "../contract-lock.js";

const truckInclude = {
  measurements: {
    orderBy: { createdAt: "asc" as const },
    include: { logs: { orderBy: { position: "asc" as const } } },
  },
  packingLogs: { orderBy: { position: "asc" as const } },
  _count: { select: { productionRuns: true } },
};

type TruckWithRel = Prisma.TruckGetPayload<{ include: typeof truckInclude }>;

function serializeTruck(t: TruckWithRel) {
  const { _count, ...rest } = t;
  return { ...rest, sawn: _count.productionRuns > 0 };
}

export async function truckRoutes(app: FastifyInstance) {
  // Liste (filtre par contrat)
  app.get<{ Querystring: { contractId?: string } }>("/trucks", async (req) => {
    const trucks = await prisma.truck.findMany({
      where: req.query.contractId ? { contractId: req.query.contractId } : undefined,
      orderBy: { arrivedAt: "desc" },
      include: truckInclude,
    });
    return trucks.map(serializeTruck);
  });

  // Détail
  app.get<{ Params: { id: string } }>("/trucks/:id", async (req, reply) => {
    const t = await prisma.truck.findUnique({
      where: { id: req.params.id },
      include: truckInclude,
    });
    if (!t) return reply.code(404).send({ error: "Camion introuvable" });
    return serializeTruck(t);
  });

  // Création
  app.post("/trucks", async (req, reply) => {
    const parsed = truckCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (!(await ensureContractOpen(reply, parsed.data.contractId))) return;

    const t = await prisma.truck.create({
      data: parsed.data,
      include: truckInclude,
    });
    return reply.code(201).send(serializeTruck(t));
  });

  // Mise à jour (champs bordereau — saisie progressive)
  app.patch<{ Params: { id: string } }>("/trucks/:id", async (req, reply) => {
    const parsed = truckUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const t = await prisma.truck.update({
        where: { id: req.params.id },
        data: parsed.data,
        include: truckInclude,
      });
      return serializeTruck(t);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Camion introuvable" });
      }
      throw e;
    }
  });

  // Suppression
  app.delete<{ Params: { id: string } }>("/trucks/:id", async (req, reply) => {
    try {
      await prisma.truck.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Camion introuvable" });
      }
      throw e;
    }
  });

  // ── Packing list grumes (spécification de transport) ────────────────
  // Remplace l'ensemble des lignes du camion (saisie/re-saisie en bloc).
  app.post<{ Params: { id: string } }>("/trucks/:id/packing", async (req, reply) => {
    const parsed = packingCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (!(await ensureTruckContractOpen(reply, req.params.id))) return;
    const truck = await prisma.truck.findUnique({ where: { id: req.params.id } });
    if (!truck) return reply.code(404).send({ error: "Camion introuvable" });

    await prisma.$transaction([
      prisma.packingLog.deleteMany({ where: { truckId: truck.id } }),
      prisma.packingLog.createMany({
        data: parsed.data.logs.map((l, i) => ({
          truckId: truck.id,
          position: i + 1,
          billNo: l.billNo,
          diaTopCm: l.diaTopCm,
          diaBottomCm: l.diaBottomCm,
          diaMeanCm: l.diaMeanCm,
          lengthM: l.lengthM,
          volumeM3: l.volumeM3,
        })),
      }),
    ]);
    const t = await prisma.truck.findUnique({
      where: { id: truck.id },
      include: truckInclude,
    });
    return reply.code(201).send(serializeTruck(t!));
  });

  // Vider la packing list
  app.delete<{ Params: { id: string } }>("/trucks/:id/packing", async (req, reply) => {
    await prisma.packingLog.deleteMany({ where: { truckId: req.params.id } });
    return reply.code(204).send();
  });

  // Nouvel étalage (calculs volume côté serveur — F1/F2)
  app.post<{ Params: { id: string } }>("/trucks/:id/measurements", async (req, reply) => {
    const parsed = measurementCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (!(await ensureTruckContractOpen(reply, req.params.id))) return;
    const truck = await prisma.truck.findUnique({ where: { id: req.params.id } });
    if (!truck) return reply.code(404).send({ error: "Camion introuvable" });

    const d = parsed.data;
    const logs =
      d.context === "YARD_DIAMETER"
        ? d.logs.map((l, i) => {
            const vol = volumeDiameterM3(Number(l.lengthFt), Number(l.diameterIn));
            return {
              position: i + 1,
              externalId: l.externalId,
              lengthFt: l.lengthFt,
              diameterIn: l.diameterIn,
              volumeM3: vol.toFixed(6),
              cft: (vol * M3_TO_CFT).toFixed(4),
            };
          })
        : d.logs.map((l, i) => {
            const vol = volumeGirthM3(Number(l.lengthM), Number(l.circumferenceCm));
            return {
              position: i + 1,
              externalId: l.externalId,
              lengthM: l.lengthM,
              circumferenceCm: l.circumferenceCm,
              volumeM3: vol.toFixed(6),
            };
          });

    const m = await prisma.logMeasurement.create({
      data: {
        truckId: truck.id,
        context: d.context,
        logs: { create: logs },
      },
      include: { logs: { orderBy: { position: "asc" } } },
    });
    return reply.code(201).send(m);
  });

  // Ajout de billes à un étalage EXISTANT (« continuer l'étalage » — saisie en
  // plusieurs fois). Positions continuent après les billes déjà saisies.
  app.post<{ Params: { id: string } }>("/measurements/:id/logs", async (req, reply) => {
    const parsed = measurementCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const measurement = await prisma.logMeasurement.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { position: "desc" }, take: 1 } },
    });
    if (!measurement) return reply.code(404).send({ error: "Étalage introuvable" });
    if (!(await ensureTruckContractOpen(reply, measurement.truckId))) return;

    const d = parsed.data;
    if (d.context !== measurement.context) {
      return reply.code(400).send({ error: "Contexte de l'étalage incohérent" });
    }

    const startPos = measurement.logs[0]?.position ?? 0;
    const newLogs: Prisma.LogCreateManyInput[] =
      d.context === "YARD_DIAMETER"
        ? d.logs.map((l, i) => {
            const vol = volumeDiameterM3(Number(l.lengthFt), Number(l.diameterIn));
            return {
              measurementId: measurement.id,
              position: startPos + i + 1,
              externalId: l.externalId,
              lengthFt: l.lengthFt,
              diameterIn: l.diameterIn,
              volumeM3: vol.toFixed(6),
              cft: (vol * M3_TO_CFT).toFixed(4),
            };
          })
        : d.logs.map((l, i) => {
            const vol = volumeGirthM3(Number(l.lengthM), Number(l.circumferenceCm));
            return {
              measurementId: measurement.id,
              position: startPos + i + 1,
              externalId: l.externalId,
              lengthM: l.lengthM,
              circumferenceCm: l.circumferenceCm,
              volumeM3: vol.toFixed(6),
            };
          });

    await prisma.log.createMany({ data: newLogs });
    const m = await prisma.logMeasurement.findUnique({
      where: { id: measurement.id },
      include: { logs: { orderBy: { position: "asc" } } },
    });
    return reply.code(201).send(m);
  });

  // Suppression d'un étalage
  app.delete<{ Params: { id: string } }>("/measurements/:id", async (req, reply) => {
    try {
      await prisma.logMeasurement.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Étalage introuvable" });
      }
      throw e;
    }
  });
}
