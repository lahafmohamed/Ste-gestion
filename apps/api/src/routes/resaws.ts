import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { classifySize, resawOpCreateSchema, sawnVolumeM3 } from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen } from "../contract-lock.js";

// Resciage : bois déjà scié en stock repassé à la scie en sections plus
// petites. Volumes F3 + classement F4 côté serveur, comme le débitage.

const opInclude = {
  lines: { orderBy: { position: "asc" as const } },
};

type OpWithLines = Prisma.ResawOpGetPayload<{ include: typeof opInclude }>;

function serializeOp(o: OpWithLines) {
  const { lines, ...rest } = o;
  return {
    ...rest,
    consumed: lines.filter((l) => l.kind === "CONSUMED"),
    produced: lines.filter((l) => l.kind === "PRODUCED"),
  };
}

function buildLines(
  kind: "CONSUMED" | "PRODUCED",
  lines: { lengthFt: string; widthIn: string; thicknessIn: string; count: number }[]
) {
  return lines.map((l, i) => {
    const size = classifySize(Number(l.widthIn), Number(l.thicknessIn));
    const vol = sawnVolumeM3(
      Number(l.lengthFt),
      Number(l.widthIn),
      Number(l.thicknessIn),
      l.count
    );
    return {
      kind,
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
}

export async function resawRoutes(app: FastifyInstance) {
  // Liste (filtre par contrat)
  app.get<{ Querystring: { contractId?: string } }>("/resaws", async (req) => {
    const ops = await prisma.resawOp.findMany({
      where: req.query.contractId ? { contractId: req.query.contractId } : undefined,
      orderBy: { resawnAt: "desc" },
      include: opInclude,
    });
    return ops.map(serializeOp);
  });

  // Création
  app.post("/resaws", async (req, reply) => {
    const parsed = resawOpCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (!(await ensureContractOpen(reply, d.contractId))) return;

    const consumed = buildLines("CONSUMED", d.consumed);
    const produced = buildLines("PRODUCED", d.produced);

    // On ne crée pas de matière : le produit ne peut pas dépasser le consommé
    // (la perte de trait de scie est normale dans l'autre sens).
    const inM3 = consumed.reduce((s, l) => s + Number(l.volumeM3), 0);
    const outM3 = produced.reduce((s, l) => s + Number(l.volumeM3), 0);
    if (outM3 > inM3 + 1e-6) {
      return reply.code(400).send({
        error: `Volume produit (${outM3.toFixed(3)} m³) supérieur au volume consommé (${inM3.toFixed(3)} m³)`,
      });
    }

    const o = await prisma.resawOp.create({
      data: {
        contractId: d.contractId,
        resawnAt: d.resawnAt,
        note: d.note,
        lines: { create: [...consumed, ...produced] },
      },
      include: opInclude,
    });
    return reply.code(201).send(serializeOp(o));
  });

  // Suppression
  app.delete<{ Params: { id: string } }>("/resaws/:id", async (req, reply) => {
    try {
      await prisma.resawOp.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Resciage introuvable" });
      }
      throw e;
    }
  });
}
