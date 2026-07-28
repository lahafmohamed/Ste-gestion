import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { contractCreateSchema, contractUpdateSchema } from "@ste/shared";
import { prisma } from "../prisma.js";

export async function contractRoutes(app: FastifyInstance) {
  // Liste
  app.get("/contracts", async () => {
    return prisma.contract.findMany({ orderBy: { createdAt: "desc" } });
  });

  // Détail
  app.get<{ Params: { id: string } }>("/contracts/:id", async (req, reply) => {
    const c = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!c) return reply.code(404).send({ error: "Contrat introuvable" });
    return c;
  });

  // Création
  app.post("/contracts", async (req, reply) => {
    const parsed = contractCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
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
    try {
      const c = await prisma.contract.update({
        where: { id: req.params.id },
        data: parsed.data,
      });
      return c;
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
