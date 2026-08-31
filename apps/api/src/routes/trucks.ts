import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  M3_TO_CFT,
  logUpdateSchema,
  measurementCreateSchema,
  packingCreateSchema,
  truckCreateSchema,
  truckUpdateSchema,
  volumeDiameterM3,
  volumeGirthM3,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen, ensureTruckContractOpen } from "../contract-lock.js";
import { resolveVehicle } from "../vehicles.js";

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

    // Le camion physique : choisi dans le parc, ou déduit de l'immatriculation
    // tapée (et ajouté au parc au passage). L'immat retenue est celle de la
    // fiche camion — le portail ne réintroduit pas ses variantes d'écriture.
    const { vehicleId, ...truckData } = parsed.data;
    const vehicle = vehicleId
      ? await prisma.vehicle.findUnique({ where: { id: vehicleId } })
      : await resolveVehicle(truckData.registration);
    if (vehicleId && !vehicle) {
      return reply.code(400).send({ error: "Camion introuvable dans le parc" });
    }

    // Parcelle et origine viennent du contrat : la réception ne les saisit plus.
    // Recopiées (et non lues par jointure) pour figer la provenance du voyage —
    // le contrat peut changer de parcelle plus tard sans réécrire l'historique.
    const contract = await prisma.contract.findUnique({
      where: { id: parsed.data.contractId },
      select: { parcel: true, origin: true },
    });
    const t = await prisma.truck.create({
      data: {
        ...truckData,
        vehicleId: vehicle?.id ?? null,
        registration: vehicle?.registration ?? truckData.registration,
        // Attelage habituel du camion, recopié s'il n'est pas donné — reste
        // corrigeable voyage par voyage sur le bordereau. Même règle que la
        // provenance : `null` explicite détache, seule l'absence hérite.
        driver: truckData.driver === undefined ? vehicle?.driver : truckData.driver,
        trailer: truckData.trailer === undefined ? vehicle?.trailer : truckData.trailer,
        // `null` explicite = provenance détachée volontairement ; seul l'absence
        // de champ déclenche l'héritage.
        parcel: truckData.parcel === undefined ? contract?.parcel : truckData.parcel,
        origin: truckData.origin === undefined ? contract?.origin : truckData.origin,
      },
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
    // Immat corrigée sur le bordereau : le voyage change de camion (ou en crée
    // un), sinon la fiche parc et l'historique divergeraient en silence.
    const vehicle = parsed.data.registration
      ? await resolveVehicle(parsed.data.registration)
      : null;
    try {
      const t = await prisma.truck.update({
        where: { id: req.params.id },
        data: {
          ...parsed.data,
          ...(vehicle ? { vehicleId: vehicle.id, registration: vehicle.registration } : {}),
        },
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

  // ── Correction d'une ligne de relevé (erreur de saisie au parc) ─────
  // Le volume est TOUJOURS recalculé côté serveur à partir des mesures
  // fusionnées (patch + valeurs existantes) — jamais fourni par le client.
  app.patch<{ Params: { id: string } }>("/logs/:id", async (req, reply) => {
    const parsed = logUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const log = await prisma.log.findUnique({
      where: { id: req.params.id },
      include: { measurement: true },
    });
    if (!log) return reply.code(404).send({ error: "Ligne introuvable" });
    if (!(await ensureTruckContractOpen(reply, log.measurement.truckId))) return;

    const d = parsed.data;
    const isDia = log.measurement.context === "YARD_DIAMETER";
    if (isDia && (d.lengthM !== undefined || d.circumferenceCm !== undefined)) {
      return reply.code(400).send({ error: "Relevé en Ø : utiliser lengthFt / diameterIn" });
    }
    if (!isDia && (d.lengthFt !== undefined || d.diameterIn !== undefined)) {
      return reply.code(400).send({ error: "Relevé girth : utiliser lengthM / circumferenceCm" });
    }

    let data: Prisma.LogUpdateInput;
    if (isDia) {
      const lengthFt = d.lengthFt ?? log.lengthFt!.toString();
      const diameterIn = d.diameterIn ?? log.diameterIn!.toString();
      const vol = volumeDiameterM3(Number(lengthFt), Number(diameterIn));
      data = {
        lengthFt,
        diameterIn,
        volumeM3: vol.toFixed(6),
        cft: (vol * M3_TO_CFT).toFixed(4),
      };
    } else {
      const lengthM = d.lengthM ?? log.lengthM!.toString();
      const circumferenceCm = d.circumferenceCm ?? log.circumferenceCm!.toString();
      data = {
        lengthM,
        circumferenceCm,
        volumeM3: volumeGirthM3(Number(lengthM), Number(circumferenceCm)).toFixed(6),
      };
    }
    if (d.externalId !== undefined) data.externalId = d.externalId || null;

    await prisma.log.update({ where: { id: log.id }, data });
    const m = await prisma.logMeasurement.findUnique({
      where: { id: log.measurementId },
      include: { logs: { orderBy: { position: "asc" } } },
    });
    return m;
  });

  // Suppression d'une ligne de relevé. Refusée si le billon est déjà passé à
  // la scie (le lien production → log partirait en cascade sans trace).
  // Dernière ligne du relevé → le relevé entier est supprimé.
  app.delete<{ Params: { id: string } }>("/logs/:id", async (req, reply) => {
    const log = await prisma.log.findUnique({
      where: { id: req.params.id },
      include: { measurement: true, _count: { select: { productionRuns: true } } },
    });
    if (!log) return reply.code(404).send({ error: "Ligne introuvable" });
    if (!(await ensureTruckContractOpen(reply, log.measurement.truckId))) return;
    if (log._count.productionRuns > 0) {
      return reply
        .code(409)
        .send({ error: "Ce billon est lié à un débitage — supprimer le débitage d'abord" });
    }

    const remaining = await prisma.log.count({ where: { measurementId: log.measurementId } });
    if (remaining <= 1) {
      await prisma.logMeasurement.delete({ where: { id: log.measurementId } });
    } else {
      await prisma.log.delete({ where: { id: log.id } });
    }
    return reply.code(204).send();
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
