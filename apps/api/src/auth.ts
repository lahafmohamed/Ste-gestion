import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import type { UserRole } from "@ste/shared";
import { prisma } from "./prisma.js";
import { getCachedUser, permissionsFor, requiredPermission } from "./permissions.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole };
    user: { sub: string; role: UserRole };
  }
}

// Routes publiques (pas de token requis).
const PUBLIC: { method?: string; path: string }[] = [
  { path: "/health" },
  { method: "POST", path: "/auth/login" },
];

function urlPath(req: FastifyRequest): string {
  return req.raw.url?.split("?")[0] ?? "";
}

// Secrets par défaut à ne jamais garder en production.
const WEAK_SECRETS = new Set(["change-me", "dev-secret-change-me-in-production"]);

export async function registerAuth(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET manquant dans .env");
  if (process.env.NODE_ENV === "production" && (WEAK_SECRETS.has(secret) || secret.length < 32)) {
    throw new Error(
      "JWT_SECRET faible ou par défaut en production — générer une valeur forte (≥32 caractères)."
    );
  }

  await app.register(jwt, { secret, sign: { expiresIn: "12h" } });

  app.addHook("onRequest", async (req, reply) => {
    const path = urlPath(req);
    const isPublic = PUBLIC.some(
      (p) => path === p.path && (!p.method || p.method === req.method)
    );
    if (isPublic) return;

    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Authentification requise" });
    }

    // Permissions effectives (rôle ∪ ajouts − retraits) relues au plus toutes
    // les 30 s : un compte désactivé ou dégradé sort sans attendre l'expiration
    // du JWT. Le rôle porté par le token ne fait plus foi, la base si.
    const u = await getCachedUser(req.user.sub);
    if (!u || !u.active) {
      return reply.code(401).send({ error: "Session invalide" });
    }
    req.user.role = u.role;
    if (u.role === "ADMIN") return;

    const needed = requiredPermission(req.method, path);
    if (needed === null) {
      // Aucune règle : lecture partagée. Une écriture sans règle est refusée
      // par défaut — un oubli dans la table ne doit pas ouvrir la porte.
      if (req.method === "GET" || req.method === "HEAD") return;
      return reply.code(403).send({ error: "Action non autorisée" });
    }
    const perms = await permissionsFor(u);
    if (!perms.includes(needed)) {
      return reply.code(403).send({
        error: needed === "users.manage" ? "Réservé à l'administrateur" : "Permission insuffisante pour cette action",
        permission: needed,
      });
    }
  });
}

/** Crée l'admin initial si aucun utilisateur n'existe. */
export async function bootstrapAdmin(app: FastifyInstance) {
  const count = await prisma.user.count();
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL ?? "admin@local";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  await prisma.user.create({
    data: {
      name: "Administrateur",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "ADMIN",
    },
  });
  app.log.warn(`Admin initial créé : ${email} (changer le mot de passe)`);
}
