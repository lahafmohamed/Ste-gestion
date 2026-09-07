import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { userCreateSchema, userUpdateSchema } from "@ste/shared";
import { prisma } from "../prisma.js";
import { invalidateUser, toUserDTO, userSelect as select } from "../permissions.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/users", async () => {
    const rows = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select });
    return Promise.all(rows.map(toUserDTO));
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
      return reply.code(201).send(await toUserDTO(u));
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
    // L'admin ne se rétrograde ni ne se désactive lui-même : sans ça, plus
    // personne pour rouvrir la porte.
    if (req.params.id === req.user.sub && (rest.active === false || (rest.role && rest.role !== "ADMIN"))) {
      return reply.code(400).send({ error: "Impossible de modifier son propre rôle ou statut" });
    }
    try {
      const u = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...rest,
          ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
        },
        select,
      });
      invalidateUser(u.id);
      return toUserDTO(u);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Utilisateur introuvable" });
      }
      throw e;
    }
  });
}
