import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { loginSchema } from "@ste/shared";
import { prisma } from "../prisma.js";

function toDTO(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
  };
}

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
    return { token, user: toDTO(user) };
  });

  app.get("/auth/me", async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || !user.active) return reply.code(401).send({ error: "Session invalide" });
    return toDTO(user);
  });
}
