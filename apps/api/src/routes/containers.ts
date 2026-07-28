import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  classifySize,
  containerCreateSchema,
  containerItemsAddSchema,
  containerUpdateSchema,
  sawnVolumeM3,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen } from "../contract-lock.js";

const withItems = {
  items: { orderBy: { position: "asc" as const } },
  trucks: { select: { truckId: true } },
};

type ContainerRel = Prisma.ContainerGetPayload<{ include: typeof withItems }>;

function serialize(c: ContainerRel) {
  const { trucks, ...rest } = c;
  return { ...rest, truckIds: trucks.map((t) => t.truckId) };
}

// Vérifie que les camions liés appartiennent bien au contrat.
async function assertTrucks(truckIds: string[], contractId: string) {
  const ids = [...new Set(truckIds)];
  if (ids.length === 0) return ids;
  const ok = await prisma.truck.count({ where: { id: { in: ids }, contractId } });
  if (ok !== ids.length) throw new Error("INVALID_TRUCK");
  return ids;
}

function buildItems(
  items: { lengthFt: string; widthIn: string; thicknessIn: string; count: number }[],
  startPos: number
) {
  return items.map((l, i) => {
    const size = classifySize(Number(l.widthIn), Number(l.thicknessIn));
    const vol = sawnVolumeM3(
      Number(l.lengthFt),
      Number(l.widthIn),
      Number(l.thicknessIn),
      l.count
    );
    return {
      position: startPos + i,
      lengthFt: l.lengthFt,
      widthIn: l.widthIn,
      thicknessIn: l.thicknessIn,
      count: l.count,
      sizeCode: size.code,
      sizeGroup: size.group,
      volumeM3: vol.toFixed(6),
    };
  });
}

// Horodatage auto selon le statut.
function statusStamp(status?: string) {
  if (status === "LOADED") return { loadedAt: new Date() };
  if (status === "SHIPPED") return { shippedAt: new Date() };
  return {};
}

export async function containerRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { contractId?: string } }>("/containers", async (req) => {
    const list = await prisma.container.findMany({
      where: req.query.contractId ? { contractId: req.query.contractId } : undefined,
      orderBy: { createdAt: "desc" },
      include: withItems,
    });
    return list.map(serialize);
  });

  app.get<{ Params: { id: string } }>("/containers/:id", async (req, reply) => {
    const c = await prisma.container.findUnique({
      where: { id: req.params.id },
      include: withItems,
    });
    if (!c) return reply.code(404).send({ error: "Conteneur introuvable" });
    return serialize(c);
  });

  app.post("/containers", async (req, reply) => {
    const parsed = containerCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const d = parsed.data;
    if (!(await ensureContractOpen(reply, d.contractId))) return;

    let truckIds: string[];
    try {
      truckIds = await assertTrucks(d.truckIds ?? [], d.contractId);
    } catch {
      return reply.code(400).send({ error: "Camion invalide pour ce contrat" });
    }

    const c = await prisma.container.create({
      data: {
        contractId: d.contractId,
        clientId: d.clientId ?? null,
        containerNo: d.containerNo,
        sealNo: d.sealNo,
        fauxSealNo: d.fauxSealNo,
        bookingNo: d.bookingNo,
        grade: d.grade,
        destination: d.destination,
        status: d.status,
        ...statusStamp(d.status),
        items: d.items ? { create: buildItems(d.items, 1) } : undefined,
        trucks: truckIds.length ? { create: truckIds.map((truckId) => ({ truckId })) } : undefined,
      },
      include: withItems,
    });
    return reply.code(201).send(serialize(c));
  });

  app.patch<{ Params: { id: string } }>("/containers/:id", async (req, reply) => {
    const parsed = containerUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { truckIds, ...fields } = parsed.data;

    const existing = await prisma.container.findUnique({
      where: { id: req.params.id },
      select: { contractId: true },
    });
    if (!existing) return reply.code(404).send({ error: "Conteneur introuvable" });

    // Remplacer les camions liés si fournis.
    if (truckIds) {
      try {
        const ids = await assertTrucks(truckIds, existing.contractId);
        await prisma.$transaction([
          prisma.containerTruck.deleteMany({ where: { containerId: req.params.id } }),
          prisma.containerTruck.createMany({
            data: ids.map((truckId) => ({ containerId: req.params.id, truckId })),
          }),
        ]);
      } catch {
        return reply.code(400).send({ error: "Camion invalide pour ce contrat" });
      }
    }

    const c = await prisma.container.update({
      where: { id: req.params.id },
      data: { ...fields, ...statusStamp(fields.status) },
      include: withItems,
    });
    return serialize(c);
  });

  app.delete<{ Params: { id: string } }>("/containers/:id", async (req, reply) => {
    try {
      await prisma.container.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Conteneur introuvable" });
      }
      throw e;
    }
  });

  // Ajout de lignes d'empotage (F3 côté serveur)
  app.post<{ Params: { id: string } }>("/containers/:id/items", async (req, reply) => {
    const parsed = containerItemsAddSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const container = await prisma.container.findUnique({
      where: { id: req.params.id },
      select: { id: true, contractId: true, _count: { select: { items: true } } },
    });
    if (!container) return reply.code(404).send({ error: "Conteneur introuvable" });
    if (!(await ensureContractOpen(reply, container.contractId))) return;

    await prisma.containerItem.createMany({
      data: buildItems(parsed.data.items, container._count.items + 1).map((it) => ({
        ...it,
        containerId: container.id,
      })),
    });
    const c = await prisma.container.findUnique({
      where: { id: container.id },
      include: withItems,
    });
    return reply.code(201).send(c ? serialize(c) : null);
  });

  app.delete<{ Params: { id: string } }>("/container-items/:id", async (req, reply) => {
    try {
      await prisma.containerItem.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Ligne introuvable" });
      }
      throw e;
    }
  });
}
