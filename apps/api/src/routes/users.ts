import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { userCreateSchema, userUpdateSchema } from "@ste/shared";
import { prisma } from "../prisma.js";

const select = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
};

export async function userRoutes(app: FastifyInstance) {
  app.get("/users", async () => {
    return prisma.user.findMany({ orderBy: { createdAt: "asc" }, select });
  });

  app.post("/users", async (req, reply) => {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    try {
      const u = await prisma.user.create({
        data: {
          name: d.name,
          email: d.email.toLowerCase(),
          passwordHash: await bcrypt.hash(d.password, 10),
          role: d.role,
        },
        select,
      });
      return reply.code(201).send(u);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return reply.code(409).send({ error: "Email déjà utilisé" });
      }
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>("/users/:id", async (req, reply) => {
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { password, ...rest } = parsed.data;
    try {
      const u = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...rest,
          ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
        },
        select,
      });
      return u;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Utilisateur introuvable" });
      }
      throw e;
    }
  });
}
