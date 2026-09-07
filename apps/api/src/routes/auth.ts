import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { loginSchema } from "@ste/shared";
import { prisma } from "../prisma.js";
import { toUserDTO, userSelect } from "../permissions.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Email ou mot de passe invalide" });
    }
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    if (!user || !user.active) {
      return reply.code(401).send({ error: "Identifiants incorrects" });
    }
    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "Identifiants incorrects" });

    const token = app.jwt.sign({ sub: user.id, role: user.role as never });
    const { passwordHash: _h, updatedAt: _u, ...row } = user;
    return { token, user: await toUserDTO(row) };
  });

  app.get("/auth/me", async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: userSelect });
    if (!user || !user.active) return reply.code(401).send({ error: "Session invalide" });
    return toUserDTO(user);
  });
}
