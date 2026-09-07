import type { FastifyInstance } from "fastify";
import {
  DEFAULT_ROLE_PERMISSIONS,
  UserRole,
  rolePermissionsUpdateSchema,
  type Permission,
} from "@ste/shared";
import { getRoleMatrix, invalidateUser, setRolePermissions } from "../permissions.js";

type EditableRole = Exclude<UserRole, "ADMIN">;

function parseRole(raw: string): EditableRole | null {
  const r = UserRole.safeParse(raw);
  if (!r.success || r.data === "ADMIN") return null;
  return r.data;
}

/** Matrice rôle → permissions (ADMIN seul, via le hook auth). */
export async function permissionRoutes(app: FastifyInstance) {
  app.get("/permissions/roles", async () => getRoleMatrix());

  app.put<{ Params: { role: string } }>("/permissions/roles/:role", async (req, reply) => {
    const role = parseRole(req.params.role);
    if (!role) return reply.code(400).send({ error: "Rôle inconnu ou non modifiable" });
    const parsed = rolePermissionsUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await setRolePermissions(role, parsed.data.permissions);
    // Les permissions effectives des utilisateurs de ce rôle changent.
    invalidateUser();
    return getRoleMatrix();
  });

  app.post<{ Params: { role: string } }>("/permissions/roles/:role/reset", async (req, reply) => {
    const role = parseRole(req.params.role);
    if (!role) return reply.code(400).send({ error: "Rôle inconnu ou non modifiable" });
    await setRolePermissions(role, [...DEFAULT_ROLE_PERMISSIONS[role]] as Permission[]);
    invalidateUser();
    return getRoleMatrix();
  });
}
