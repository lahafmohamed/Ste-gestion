import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { plateKey, vehicleCreateSchema, vehicleUpdateSchema } from "@ste/shared";
import { prisma } from "../prisma.js";

// Le parc de camions : le référentiel que la réception vient piocher au lieu
// de retaper l'immatriculation à chaque bordereau.

const vehicleInclude = {
  _count: { select: { trucks: true } },
  // Dernier voyage : dit d'un coup d'œil quels camions tournent encore.
  trucks: {
    orderBy: { arrivedAt: "desc" as const },
    take: 1,
    select: { arrivedAt: true },
  },
};

type VehicleWithRel = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

/**
 * Deux clés uniques sur la fiche : la plaque et le code interne. Nommer celle
 * qui bloque évite de renvoyer l'opérateur chercher un doublon d'immat quand
 * c'est le code « STE-01 » qui est déjà pris.
 */
function conflictMessage(e: Prisma.PrismaClientKnownRequestError) {
  const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
  return target.includes("code")
    ? "Ce code est déjà porté par un autre camion"
    : "Ce camion est déjà dans le parc";
}

function serializeVehicle(v: VehicleWithRel) {
  const { _count, trucks, ...rest } = v;
  return { ...rest, tripCount: _count.trucks, lastTripAt: trucks[0]?.arrivedAt ?? null };
}

export async function vehicleRoutes(app: FastifyInstance) {
  // Liste complète (actifs et retirés) — la page Camions montre les deux.
  app.get("/vehicles", async () => {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { registration: "asc" },
      include: vehicleInclude,
    });
    return vehicles.map(serializeVehicle);
  });

  app.post("/vehicles", async (req, reply) => {
    const parsed = vehicleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const key = plateKey(parsed.data.registration);
    if (key === "") {
      return reply.code(400).send({ error: "Immatriculation invalide" });
    }
    try {
      const v = await prisma.vehicle.create({
        data: { ...parsed.data, plateKey: key },
        include: vehicleInclude,
      });
      return reply.code(201).send(serializeVehicle(v));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return reply.code(409).send({ error: conflictMessage(e) });
      }
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>("/vehicles/:id", async (req, reply) => {
    const parsed = vehicleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    let key: string | undefined;
    if (d.registration !== undefined) {
      key = plateKey(d.registration);
      if (key === "") return reply.code(400).send({ error: "Immatriculation invalide" });
    }

    try {
      const v = await prisma.$transaction(async (tx) => {
        const updated = await tx.vehicle.update({
          where: { id: req.params.id },
          data: { ...d, ...(key !== undefined ? { plateKey: key } : {}) },
          include: vehicleInclude,
        });
        // Une plaque ne change pas dans la vie : la corriger ici, c'est réparer
        // une faute de frappe — les voyages déjà enregistrés portent la même
        // faute et doivent suivre (contrairement à la parcelle, qui elle bouge
        // légitimement et reste figée sur chaque voyage).
        if (d.registration !== undefined) {
          await tx.truck.updateMany({
            where: { vehicleId: updated.id },
            data: { registration: updated.registration },
          });
        }
        return updated;
      });
      return serializeVehicle(v);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") return reply.code(404).send({ error: "Camion introuvable" });
        if (e.code === "P2002") return reply.code(409).send({ error: conflictMessage(e) });
      }
      throw e;
    }
  });

  // Suppression réservée aux fiches jamais utilisées (doublon, faute de frappe).
  // Dès qu'un voyage y pend, la retirer effacerait le lien : on désactive.
  app.delete<{ Params: { id: string } }>("/vehicles/:id", async (req, reply) => {
    const v = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { trucks: true } } },
    });
    if (!v) return reply.code(404).send({ error: "Camion introuvable" });
    if (v._count.trucks > 0) {
      return reply.code(409).send({
        error: `Camion utilisé par ${v._count.trucks} réception(s) — le désactiver plutôt que le supprimer`,
      });
    }
    await prisma.vehicle.delete({ where: { id: v.id } });
    return reply.code(204).send();
  });
}
