import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  classifySize,
  containerCreateSchema,
  containerItemsAddSchema,
  containerUpdateSchema,
  qualityFromLabel,
  sawnVolumeM3,
  type Quality,
} from "@ste/shared";
import { prisma } from "../prisma.js";

// Empotage : on charge ce qui est disponible au stock général — pas de contrat
// à choisir. Le lien camions reste possible (traçabilité), tous contrats
// confondus, et n'est plus obligatoire.

const withItems = {
  items: { orderBy: { position: "asc" as const } },
  trucks: { select: { truckId: true } },
};

type ContainerRel = Prisma.ContainerGetPayload<{ include: typeof withItems }>;

function serialize(c: ContainerRel) {
  const { trucks, ...rest } = c;
  return { ...rest, truckIds: trucks.map((t) => t.truckId) };
}

// Vérifie que les camions cochés existent (tous contrats confondus).
async function assertTrucks(truckIds: string[]) {
  const ids = [...new Set(truckIds)];
  if (ids.length === 0) return ids;
  const ok = await prisma.truck.count({ where: { id: { in: ids } } });
  if (ok !== ids.length) throw new Error("INVALID_TRUCK");
  return ids;
}

// Qualité d'une ligne : celle choisie (panier d'empotage = celle du stock),
// sinon celle du grade écrit sur le conteneur (« 5X3 C GRADE » → C).
function buildItems(
  items: {
    lengthFt: string;
    widthIn: string;
    thicknessIn: string;
    count: number;
    quality?: Quality;
  }[],
  startPos: number,
  grade?: string | null
) {
  const fallback = qualityFromLabel(grade);
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
      quality: l.quality ?? fallback,
      sizeCode: size.code,
      sizeGroup: size.group,
      volumeM3: vol.toFixed(6),
    };
  });
}

// Horodatage auto selon le statut — au PASSAGE dans ce statut seulement :
// renvoyer « LOADED » avec le plomb ne doit pas redater le chargement (le
// rapport du jour le classe à cette date).
function statusStamp(status?: string, previous?: string) {
  if (status === previous) return {};
  if (status === "LOADED") return { loadedAt: new Date() };
  if (status === "SHIPPED") return { shippedAt: new Date() };
  return {};
}

// Client (tiers) choisi : il doit exister, sinon la clé étrangère part en 500.
async function clientExists(clientId: string | null | undefined) {
  if (!clientId) return true;
  return (await prisma.party.count({ where: { id: clientId } })) > 0;
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

    let truckIds: string[];
    try {
      truckIds = await assertTrucks(d.truckIds ?? []);
    } catch {
      return reply.code(400).send({ error: "Camion introuvable" });
    }
    if (!(await clientExists(d.clientId))) {
      return reply.code(400).send({ error: "Client introuvable" });
    }

    const c = await prisma.container.create({
      data: {
        clientId: d.clientId ?? null,
        containerNo: d.containerNo,
        sealNo: d.sealNo,
        fauxSealNo: d.fauxSealNo,
        bookingNo: d.bookingNo,
        grade: d.grade,
        destination: d.destination,
        status: d.status,
        ...statusStamp(d.status),
        items: d.items ? { create: buildItems(d.items, 1, d.grade) } : undefined,
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
      select: { id: true, status: true },
    });
    if (!existing) return reply.code(404).send({ error: "Conteneur introuvable" });

    let ids: string[] | undefined;
    if (truckIds) {
      try {
        ids = await assertTrucks(truckIds);
      } catch {
        return reply.code(400).send({ error: "Camion introuvable" });
      }
    }
    if (!(await clientExists(fields.clientId))) {
      return reply.code(400).send({ error: "Client introuvable" });
    }

    // Camions liés remplacés (si fournis) et champs mis à jour d'un seul bloc :
    // un échec sur l'un ne laisse pas l'autre à moitié écrit.
    const c = await prisma.$transaction(async (tx) => {
      if (ids) {
        await tx.containerTruck.deleteMany({ where: { containerId: existing.id } });
        await tx.containerTruck.createMany({
          data: ids.map((truckId) => ({ containerId: existing.id, truckId })),
        });
      }
      return tx.container.update({
        where: { id: existing.id },
        data: { ...fields, ...statusStamp(fields.status, existing.status) },
        include: withItems,
      });
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
      // Dernière position (et non le nombre de lignes) : après une ligne
      // supprimée, le compte retomberait sur une position déjà prise.
      select: {
        id: true,
        grade: true,
        items: { select: { position: true }, orderBy: { position: "desc" }, take: 1 },
      },
    });
    if (!container) return reply.code(404).send({ error: "Conteneur introuvable" });

    const startPos = (container.items[0]?.position ?? 0) + 1;
    await prisma.containerItem.createMany({
      data: buildItems(parsed.data.items, startPos, container.grade).map((it) => ({
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
