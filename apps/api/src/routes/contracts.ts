import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { contractCreateSchema, contractUpdateSchema } from "@ste/shared";
import { prisma } from "../prisma.js";
import {
  FINANCE_EDIT_MSG,
  canEditFinance,
  canSeeFinance,
  redactContract,
  touchesFinance,
} from "../finance.js";

export async function contractRoutes(app: FastifyInstance) {
  // Liste
  // Sans `finances.view` : les prix, frais, budgets et tiers partent à null.
  app.get("/contracts", async (req) => {
    const list = await prisma.contract.findMany({ orderBy: { createdAt: "desc" } });
    return (await canSeeFinance(req)) ? list : list.map(redactContract);
  });

  // Détail
  app.get<{ Params: { id: string } }>("/contracts/:id", async (req, reply) => {
    const c = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!c) return reply.code(404).send({ error: "Contrat introuvable" });
    return (await canSeeFinance(req)) ? c : redactContract(c);
  });

  // Création
  app.post("/contracts", async (req, reply) => {
    const parsed = contractCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (touchesFinance(parsed.data) && !(await canEditFinance(req))) {
      return reply.code(403).send({ error: FINANCE_EDIT_MSG, permission: "finances.edit" });
    }
    try {
      const c = await prisma.contract.create({ data: parsed.data });
      return reply.code(201).send(c);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return reply.code(409).send({ error: "Code de contrat déjà utilisé" });
      }
      throw e;
    }
  });

  // Mise à jour
  app.patch<{ Params: { id: string } }>("/contracts/:id", async (req, reply) => {
    const parsed = contractUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    // `contracts.edit` couvre le n°, le quota et l'administratif ; les prix
    // demandent en plus `finances.edit`.
    if (touchesFinance(parsed.data) && !(await canEditFinance(req))) {
      return reply.code(403).send({ error: FINANCE_EDIT_MSG, permission: "finances.edit" });
    }
    try {
      const c = await prisma.contract.update({
        where: { id: req.params.id },
        data: parsed.data,
      });
      return (await canSeeFinance(req)) ? c : redactContract(c);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") return reply.code(404).send({ error: "Contrat introuvable" });
        if (e.code === "P2002") return reply.code(409).send({ error: "Code de contrat déjà utilisé" });
      }
      throw e;
    }
  });

  // Suppression
  app.delete<{ Params: { id: string } }>("/contracts/:id", async (req, reply) => {
    try {
      await prisma.contract.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Contrat introuvable" });
      }
      throw e;
    }
  });
}
