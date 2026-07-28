import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { accountEntryCreateSchema, partyCreateSchema } from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen } from "../contract-lock.js";

export async function accountRoutes(app: FastifyInstance) {
  // ── Tiers ────────────────────────────────────────────────────────────

  app.get("/parties", async () => {
    return prisma.party.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/parties", async (req, reply) => {
    const parsed = partyCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const p = await prisma.party.create({ data: parsed.data });
      return reply.code(201).send(p);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return reply.code(409).send({ error: "Tiers déjà existant" });
      }
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>("/parties/:id", async (req, reply) => {
    try {
      await prisma.party.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") return reply.code(404).send({ error: "Tiers introuvable" });
        if (e.code === "P2003")
          return reply.code(409).send({ error: "Tiers utilisé par des écritures" });
      }
      throw e;
    }
  });

  // ── Écritures ────────────────────────────────────────────────────────

  app.post("/account-entries", async (req, reply) => {
    const parsed = accountEntryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (!(await ensureContractOpen(reply, d.contractId))) return;
    const party = await prisma.party.findUnique({ where: { id: d.partyId } });
    if (!party) return reply.code(404).send({ error: "Tiers introuvable" });

    const e = await prisma.accountEntry.create({ data: d });
    return reply.code(201).send(e);
  });

  app.delete<{ Params: { id: string } }>("/account-entries/:id", async (req, reply) => {
    try {
      await prisma.accountEntry.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Écriture introuvable" });
      }
      throw e;
    }
  });

  // ── Comptes agrégés par contrat ──────────────────────────────────────

  app.get<{ Params: { id: string } }>("/contracts/:id/accounts", async (req) => {
    const entries = await prisma.accountEntry.findMany({
      where: { contractId: req.params.id },
      orderBy: { entryDate: "asc" },
      include: { party: true },
    });

    const byParty = new Map<
      string,
      { party: (typeof entries)[number]["party"]; due: number; paid: number; entries: typeof entries }
    >();

    for (const e of entries) {
      let acc = byParty.get(e.partyId);
      if (!acc) {
        acc = { party: e.party, due: 0, paid: 0, entries: [] as typeof entries };
        byParty.set(e.partyId, acc);
      }
      if (e.kind === "DUE") acc.due += Number(e.amount);
      else acc.paid += Number(e.amount);
      acc.entries.push(e);
    }

    return [...byParty.values()].map((a) => ({
      party: a.party,
      due: a.due.toFixed(2),
      paid: a.paid.toFixed(2),
      balance: (a.due - a.paid).toFixed(2),
      entries: a.entries.map(({ party: _p, ...rest }) => rest),
    }));
  });
}
