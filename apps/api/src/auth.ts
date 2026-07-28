import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import type { UserRole } from "@ste/shared";
import { prisma } from "./prisma.js";

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

// Écritures par module → rôles autorisés (matrice PLAN §7). ADMIN passe partout.
const WRITE_RULES: { pattern: RegExp; roles: UserRole[] }[] = [
  { pattern: /^\/contracts/, roles: ["BUREAU"] },
  { pattern: /^\/trucks|^\/measurements/, roles: ["PARC"] },
  { pattern: /^\/production-runs/, roles: ["SCIERIE"] },
  { pattern: /^\/sales/, roles: ["EXPORT"] },
  { pattern: /^\/containers|^\/container-items/, roles: ["EXPORT", "PARC"] },
  { pattern: /^\/account-entries|^\/parties/, roles: ["BUREAU"] },
  { pattern: /^\/users/, roles: [] }, // ADMIN uniquement
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

    // Lectures libres pour tout utilisateur connecté ; /users réservé ADMIN.
    const role = req.user.role;
    if (role === "ADMIN") return;
    if (path.startsWith("/users")) {
      return reply.code(403).send({ error: "Réservé à l'administrateur" });
    }
    if (req.method === "GET") return;

    const rule = WRITE_RULES.find((r) => r.pattern.test(path));
    if (rule && !rule.roles.includes(role)) {
      return reply.code(403).send({ error: "Rôle insuffisant pour cette action" });
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
