import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { saleCreateSchema, saleLineAmountCfa } from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen } from "../contract-lock.js";

const saleInclude = { lines: { orderBy: { position: "asc" as const } } };

export async function saleRoutes(app: FastifyInstance) {
  // Liste (filtre par contrat)
  app.get<{ Querystring: { contractId?: string } }>("/sales", async (req) => {
    return prisma.sale.findMany({
      where: req.query.contractId ? { contractId: req.query.contractId } : undefined,
      orderBy: { saleDate: "desc" },
      include: saleInclude,
    });
  });

  // Détail
  app.get<{ Params: { id: string } }>("/sales/:id", async (req, reply) => {
    const s = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: saleInclude,
    });
    if (!s) return reply.code(404).send({ error: "Vente introuvable" });
    return s;
  });

  // Création (montant CFA calculé serveur)
  app.post("/sales", async (req, reply) => {
    const parsed = saleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (!(await ensureContractOpen(reply, d.contractId))) return;

    const lines = d.lines.map((l, i) => {
      const amount = saleLineAmountCfa({
        volumeM3: Number(l.volumeM3),
        unitPriceCfa: l.unitPriceCfa != null ? Number(l.unitPriceCfa) : null,
        unitPriceUsd: l.unitPriceUsd != null ? Number(l.unitPriceUsd) : null,
        usdCfaRate: l.usdCfaRate != null ? Number(l.usdCfaRate) : null,
      });
      return {
        position: i + 1,
        sizeCode: l.sizeCode,
        volumeM3: l.volumeM3,
        unitPriceUsd: l.unitPriceUsd,
        usdCfaRate: l.usdCfaRate,
        unitPriceCfa: l.unitPriceCfa,
        amountCfa: amount.toFixed(2),
      };
    });

    const s = await prisma.sale.create({
      data: {
        contractId: d.contractId,
        clientId: d.clientId ?? null,
        saleDate: d.saleDate,
        deliveryNote: d.deliveryNote,
        note: d.note,
        lines: { create: lines },
      },
      include: saleInclude,
    });
    return reply.code(201).send(s);
  });

  // Suppression
  app.delete<{ Params: { id: string } }>("/sales/:id", async (req, reply) => {
    try {
      await prisma.sale.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Vente introuvable" });
      }
      throw e;
    }
  });
}
