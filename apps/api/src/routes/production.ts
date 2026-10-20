import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { SizeGroup } from "@ste/shared";
import {
  classifySize,
  productionRunCreateSchema,
  sawnVolumeM3,
  sizeSortIndex,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { LOCK_MSG } from "../contract-lock.js";

const runInclude = {
  lines: { orderBy: { position: "asc" as const } },
  trucks: { select: { truckId: true } },
  logs: { select: { logId: true } },
};

type RunWithRel = Prisma.ProductionRunGetPayload<{ include: typeof runInclude }>;

function serializeRun(r: RunWithRel) {
  const { trucks, logs, ...rest } = r;
  return {
    ...rest,
    truckIds: trucks.map((t) => t.truckId),
    logIds: logs.map((l) => l.logId),
  };
}

export async function productionRoutes(app: FastifyInstance) {
  // Liste — tout le débitage par défaut, filtrable par contrat ou par camion.
  app.get<{ Querystring: { contractId?: string; truckId?: string } }>(
    "/production-runs",
    async (req) => {
      const { contractId, truckId } = req.query;
      const runs = await prisma.productionRun.findMany({
        where: {
          ...(contractId ? { contractId } : {}),
          ...(truckId ? { trucks: { some: { truckId } } } : {}),
        },
        orderBy: { producedAt: "desc" },
        include: runInclude,
      });
      return runs.map(serializeRun);
    }
  );

  // Agrégat débité par taille (bloc CONTRACTS CUTTING). Sans contrat : tout le
  // débité, tous contrats confondus — ce que montre la page Débitage.
  async function cuttingAgg(contractId?: string) {
    const lines = await prisma.sawnLine.findMany({
      where: { run: contractId ? { contractId } : {} },
      select: { sizeCode: true, sizeGroup: true, volumeM3: true, count: true },
    });

    const bySize = new Map<string, { group: SizeGroup; volume: number; pieces: number }>();
    const groups: Record<SizeGroup, number> = { MAIN: 0, SIDE: 0, ONE_INCH: 0, OTHER: 0 };
    let totalM3 = 0;
    let totalPieces = 0;

    for (const l of lines) {
      const v = Number(l.volumeM3);
      const g = l.sizeGroup as SizeGroup;
      let acc = bySize.get(l.sizeCode);
      if (!acc) {
        acc = { group: g, volume: 0, pieces: 0 };
        bySize.set(l.sizeCode, acc);
      }
      acc.volume += v;
      acc.pieces += l.count;
      groups[g] += v;
      totalM3 += v;
      totalPieces += l.count;
    }

    const sizes = [...bySize.entries()]
      .map(([code, a]) => ({
        code,
        group: a.group,
        volumeM3: a.volume.toFixed(6),
        pieces: a.pieces,
      }))
      .sort((a, b) => sizeSortIndex(a.code) - sizeSortIndex(b.code));

    return {
      sizes,
      groups: {
        MAIN: groups.MAIN.toFixed(6),
        SIDE: groups.SIDE.toFixed(6),
        ONE_INCH: groups.ONE_INCH.toFixed(6),
        OTHER: groups.OTHER.toFixed(6),
      },
      totalM3: totalM3.toFixed(6),
      totalPieces,
    };
  }

  app.get<{ Querystring: { contractId?: string } }>("/cutting", async (req) =>
    cuttingAgg(req.query.contractId)
  );

  app.get<{ Params: { id: string } }>("/contracts/:id/cutting", async (req) =>
    cuttingAgg(req.params.id)
  );

  // Détail
  app.get<{ Params: { id: string } }>("/production-runs/:id", async (req, reply) => {
    const r = await prisma.productionRun.findUnique({
      where: { id: req.params.id },
      include: runInclude,
    });
    if (!r) return reply.code(404).send({ error: "Session introuvable" });
    return serializeRun(r);
  });

  // Création (volumes F3 + classement F4 côté serveur ; camions sciés en option)
  app.post("/production-runs", async (req, reply) => {
    const parsed = productionRunCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;

    // Le contrat ne se choisit plus : le débité part au stock général. On le
    // recopie depuis les camions sciés pour garder le rendement par contrat —
    // null si la session mélange deux contrats (aucun ne peut la revendiquer).
    const truckIds = [...new Set(d.truckIds ?? [])];
    let contractId: string | null = null;
    if (truckIds.length > 0) {
      const trucks = await prisma.truck.findMany({
        where: { id: { in: truckIds } },
        select: { contractId: true, contract: { select: { status: true } } },
      });
      if (trucks.length !== truckIds.length) {
        return reply.code(400).send({ error: "Camion introuvable" });
      }
      // Contrat clôturé : ses camions ne se scient plus.
      if (trucks.some((t) => t.contract.status !== "OPEN")) {
        return reply.code(409).send({ error: LOCK_MSG });
      }
      const contracts = new Set(trucks.map((t) => t.contractId));
      contractId = contracts.size === 1 ? trucks[0].contractId : null;
    }

    // Billes sciées : billons girth des camions sélectionnés uniquement.
    const logIds = [...new Set(d.logIds ?? [])];
    if (logIds.length > 0) {
      if (truckIds.length === 0) {
        return reply
          .code(400)
          .send({ error: "Sélectionner le camion des billes sciées" });
      }
      const ok = await prisma.log.count({
        where: {
          id: { in: logIds },
          measurement: { context: "YARD_GIRTH", truckId: { in: truckIds } },
        },
      });
      if (ok !== logIds.length) {
        return reply
          .code(400)
          .send({ error: "Bille invalide (hors girth des camions sélectionnés)" });
      }
    }

    const lines = d.lines.map((l, i) => {
      const size = classifySize(Number(l.widthIn), Number(l.thicknessIn));
      const vol = sawnVolumeM3(
        Number(l.lengthFt),
        Number(l.widthIn),
        Number(l.thicknessIn),
        l.count
      );
      return {
        position: i + 1,
        lengthFt: l.lengthFt,
        widthIn: l.widthIn,
        thicknessIn: l.thicknessIn,
        count: l.count,
        sizeCode: size.code,
        sizeGroup: size.group,
        volumeM3: vol.toFixed(6),
      };
    });

    const r = await prisma.productionRun.create({
      data: {
        contractId,
        producedAt: d.producedAt,
        note: d.note,
        lines: { create: lines },
        trucks: { create: truckIds.map((truckId) => ({ truckId })) },
        logs: { create: logIds.map((logId) => ({ logId })) },
      },
      include: runInclude,
    });
    return reply.code(201).send(serializeRun(r));
  });

  // Suppression
  app.delete<{ Params: { id: string } }>("/production-runs/:id", async (req, reply) => {
    try {
      await prisma.productionRun.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Session introuvable" });
      }
      throw e;
    }
  });
}
