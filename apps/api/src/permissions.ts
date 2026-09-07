import type { Prisma } from "@prisma/client";
import {
  ADMIN_ONLY_PERMISSION,
  effectivePermissions,
  type Permission,
  type RolePermissionsDTO,
  type UserRole,
} from "@ste/shared";
import { prisma } from "./prisma.js";

// ── Route → permission ──────────────────────────────────────────────────
// Première règle qui matche (méthode + chemin sans query). Une route absente
// de la table est libre pour tout utilisateur connecté (lectures partagées :
// /contracts, /trucks, /production-runs…, dont toutes les pages ont besoin).
// Toute ÉCRITURE doit avoir une règle : le hook refuse une écriture non listée
// plutôt que de la laisser passer (le trou qu'avaient /logs et /resaws).

type Rule = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "*";
  pattern: RegExp;
  permission: Permission;
};

const ID = "[^/]+";

const RULES: Rule[] = [
  // Administration — ADMIN seul.
  { method: "*", pattern: /^\/users(\/|$)/, permission: ADMIN_ONLY_PERMISSION },
  { method: "*", pattern: /^\/permissions(\/|$)/, permission: ADMIN_ONLY_PERMISSION },

  // Lectures sensibles (argent, comptes) — gardées par le « Voir » du module.
  { method: "GET", pattern: new RegExp(`^/contracts/${ID}/accounts$`), permission: "compta.view" },
  {
    method: "GET",
    pattern: new RegExp(`^/contracts/${ID}/account-suggestions$`),
    permission: "compta.view",
  },
  { method: "GET", pattern: /^\/parties(\/|$)/, permission: "compta.view" },
  { method: "GET", pattern: /^\/account-entries(\/|$)/, permission: "compta.view" },
  { method: "GET", pattern: /^\/sales(\/|$)/, permission: "ventes.view" },
  {
    method: "GET",
    pattern: new RegExp(`^/contracts/${ID}/daily-report$`),
    permission: "rapport.view",
  },
  { method: "GET", pattern: /\/export\.xlsx$/, permission: "contracts.export" },

  // Import Excel : aperçu = lecture ; application = vérifiée feuille par
  // feuille dans le service (étalage / débitage / empotage / réception).
  { method: "POST", pattern: /^\/imports\/(preview|apply)$/, permission: "contracts.view" },

  // Contrats
  { method: "POST", pattern: /^\/contracts$/, permission: "contracts.create" },
  { method: "PATCH", pattern: new RegExp(`^/contracts/${ID}$`), permission: "contracts.edit" },
  { method: "DELETE", pattern: new RegExp(`^/contracts/${ID}$`), permission: "contracts.delete" },

  // Réception (camions, packing list grumes)
  { method: "*", pattern: new RegExp(`^/trucks/${ID}/packing$`), permission: "reception.edit" },
  {
    method: "POST",
    pattern: new RegExp(`^/trucks/${ID}/measurements$`),
    permission: "etalage.create",
  },
  { method: "POST", pattern: /^\/trucks$/, permission: "reception.create" },
  { method: "PATCH", pattern: new RegExp(`^/trucks/${ID}$`), permission: "reception.edit" },
  { method: "DELETE", pattern: new RegExp(`^/trucks/${ID}$`), permission: "reception.delete" },

  // Étalage (relevés, lignes)
  {
    method: "POST",
    pattern: new RegExp(`^/measurements/${ID}/logs$`),
    permission: "etalage.create",
  },
  { method: "DELETE", pattern: new RegExp(`^/measurements/${ID}$`), permission: "etalage.delete" },
  { method: "PATCH", pattern: new RegExp(`^/logs/${ID}$`), permission: "etalage.edit" },
  { method: "DELETE", pattern: new RegExp(`^/logs/${ID}$`), permission: "etalage.delete" },

  // Débitage
  { method: "POST", pattern: /^\/production-runs$/, permission: "debitage.create" },
  {
    method: "DELETE",
    pattern: new RegExp(`^/production-runs/${ID}$`),
    permission: "debitage.delete",
  },

  // Stock (resciages)
  { method: "POST", pattern: /^\/resaws$/, permission: "stock.create" },
  { method: "DELETE", pattern: new RegExp(`^/resaws/${ID}$`), permission: "stock.delete" },

  // Empotage
  { method: "POST", pattern: /^\/containers$/, permission: "empotage.create" },
  {
    method: "POST",
    pattern: new RegExp(`^/containers/${ID}/items$`),
    permission: "empotage.create",
  },
  { method: "PATCH", pattern: new RegExp(`^/containers/${ID}$`), permission: "empotage.edit" },
  { method: "DELETE", pattern: new RegExp(`^/containers/${ID}$`), permission: "empotage.delete" },
  {
    method: "DELETE",
    pattern: new RegExp(`^/container-items/${ID}$`),
    permission: "empotage.delete",
  },

  // Ventes
  { method: "POST", pattern: /^\/sales$/, permission: "ventes.create" },
  { method: "DELETE", pattern: new RegExp(`^/sales/${ID}$`), permission: "ventes.delete" },

  // Comptabilité
  { method: "POST", pattern: /^\/parties$/, permission: "compta.create" },
  { method: "POST", pattern: /^\/account-entries$/, permission: "compta.create" },
  { method: "DELETE", pattern: new RegExp(`^/parties/${ID}$`), permission: "compta.delete" },
  {
    method: "DELETE",
    pattern: new RegExp(`^/account-entries/${ID}$`),
    permission: "compta.delete",
  },

  // Camions (référentiel)
  { method: "POST", pattern: /^\/vehicles$/, permission: "camions.create" },
  { method: "PATCH", pattern: new RegExp(`^/vehicles/${ID}$`), permission: "camions.edit" },
  { method: "DELETE", pattern: new RegExp(`^/vehicles/${ID}$`), permission: "camions.delete" },
];

/** Permission requise pour (méthode, chemin) ; `null` = libre pour tout connecté. */
export function requiredPermission(method: string, path: string): Permission | null {
  const m = method.toUpperCase();
  for (const r of RULES) {
    if ((r.method === "*" || r.method === m) && r.pattern.test(path)) return r.permission;
  }
  return null;
}

// ── Caches ──────────────────────────────────────────────────────────────
// Une seule instance API (systemd) : cache mémoire, invalidé par les routes
// d'écriture. Les utilisateurs sont relus au plus toutes les 30 s pour que
// désactivation / changement de rôle prennent effet sans attendre l'expiration
// du JWT (12 h).

let roleMatrix: RolePermissionsDTO | null = null;

export async function getRoleMatrix(): Promise<RolePermissionsDTO> {
  if (roleMatrix) return roleMatrix;
  const rows = await prisma.rolePermission.findMany();
  const m: RolePermissionsDTO = { BUREAU: [], PARC: [], SCIERIE: [], EXPORT: [] };
  for (const r of rows) {
    if (r.role === "ADMIN") continue;
    m[r.role].push(r.permission as Permission);
  }
  roleMatrix = m;
  return m;
}

export function invalidateRoleMatrix() {
  roleMatrix = null;
}

export async function setRolePermissions(
  role: Exclude<UserRole, "ADMIN">,
  permissions: Permission[],
) {
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { role } }),
    prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ role, permission })),
      skipDuplicates: true,
    }),
  ]);
  invalidateRoleMatrix();
}

type CachedUser = {
  id: string;
  role: UserRole;
  active: boolean;
  permissionsGranted: string[];
  permissionsRevoked: string[];
};

const USER_TTL_MS = 30_000;
const userCache = new Map<string, { at: number; u: CachedUser | null }>();

export async function getCachedUser(id: string): Promise<CachedUser | null> {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.u;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      active: true,
      permissionsGranted: true,
      permissionsRevoked: true,
    },
  });
  userCache.set(id, { at: Date.now(), u: u as CachedUser | null });
  return u as CachedUser | null;
}

export function invalidateUser(id?: string) {
  if (id) userCache.delete(id);
  else userCache.clear();
}

/** Permissions effectives d'un utilisateur (rôle ∪ ajouts − retraits). */
export async function permissionsFor(u: {
  role: UserRole;
  permissionsGranted: string[];
  permissionsRevoked: string[];
}): Promise<Permission[]> {
  if (u.role === "ADMIN") return effectivePermissions("ADMIN", []);
  const matrix = await getRoleMatrix();
  return effectivePermissions(u.role, matrix[u.role], u.permissionsGranted, u.permissionsRevoked);
}

/** Sélection Prisma d'un utilisateur pour le DTO (sans le hash). */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  permissionsGranted: true,
  permissionsRevoked: true,
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export async function toUserDTO(u: UserRow) {
  return { ...u, permissions: await permissionsFor(u) };
}
