import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULES,
  USER_ROLE_LABELS,
  type Permission,
  type RolePermissionsDTO,
  type UserRole,
} from "@ste/shared";
import { permissionsApi } from "../../lib/api";
import { FormError, QueryError } from "../ui/Feedback";
import { SkeletonList } from "../ui/Skeleton";
import { TableWrap } from "../ui/Table";

type EditableRole = Exclude<UserRole, "ADMIN">;
const ROLES: EditableRole[] = ["BUREAU", "PARC", "SCIERIE", "EXPORT"];

/**
 * Matrice rôle × permission. Chaque case s'enregistre au clic (PUT de la liste
 * complète du rôle) ; la colonne ADMIN est affichée verrouillée : il a tout.
 * En tête de colonne : tout / rien / valeurs par défaut (PLAN §7).
 */
export default function PermissionsMatrix() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const matrix = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: permissionsApi.roles,
  });

  const save = useMutation({
    mutationFn: ({ role, permissions }: { role: EditableRole; permissions: Permission[] }) =>
      permissionsApi.setRole(role, { permissions }),
    // Optimiste : la case bascule tout de suite, le serveur confirme ou rétablit.
    onMutate: async ({ role, permissions }) => {
      await qc.cancelQueries({ queryKey: ["permissions", "roles"] });
      const prev = qc.getQueryData<RolePermissionsDTO>(["permissions", "roles"]);
      if (prev)
        qc.setQueryData(["permissions", "roles"], {
          ...prev,
          [role]: permissions,
        });
      setError(null);
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["permissions", "roles"], ctx.prev);
      setError(e.message);
    },
    onSuccess: (data) => qc.setQueryData(["permissions", "roles"], data),
    // Les comptes affichés portent leurs permissions effectives : à relire.
    onSettled: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const reset = useMutation({
    mutationFn: (role: EditableRole) => permissionsApi.resetRole(role),
    onSuccess: (data) => {
      setError(null);
      qc.setQueryData(["permissions", "roles"], data);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (matrix.isLoading) return <SkeletonList count={6} lines={1} />;
  if (matrix.isError || !matrix.data) {
    return (
      <QueryError error={matrix.error} onRetry={() => matrix.refetch()}>
        Impossible de charger les permissions
      </QueryError>
    );
  }
  const m = matrix.data;

  function has(role: EditableRole, p: Permission) {
    return m[role].includes(p);
  }
  function toggle(role: EditableRole, p: Permission) {
    const next = has(role, p) ? m[role].filter((x) => x !== p) : [...m[role], p];
    save.mutate({ role, permissions: next });
  }
  function setAll(role: EditableRole, on: boolean) {
    save.mutate({ role, permissions: on ? [...ALL_PERMISSIONS] : [] });
  }
  function setModule(role: EditableRole, modKey: string, on: boolean) {
    const mod = ALL_PERMISSIONS.filter((p) => p.startsWith(`${modKey}.`));
    const rest = m[role].filter((p) => !p.startsWith(`${modKey}.`));
    save.mutate({ role, permissions: on ? [...rest, ...mod] : rest });
  }
  function isDefault(role: EditableRole) {
    const d = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
    return m[role].length === d.size && m[role].every((p) => d.has(p));
  }

  const busy = save.isPending || reset.isPending;

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-500">
        Cochez ce que chaque rôle peut faire. « Voir » ouvre la page ; sans lui les autres cases du
        module n'ont pas d'effet dans l'interface. Chaque clic est enregistré aussitôt et s'applique
        aux comptes du rôle dans les 30 secondes.
      </p>
      {error && <FormError>{error}</FormError>}

      <TableWrap stickyFirstCol className="rounded-xl bg-white shadow-card">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-100">
              <th className="px-3 py-2 text-left font-normal text-brand-500">Module · action</th>
              <th
                className="px-2 py-2 text-center font-medium text-brand-400"
                title="L'administrateur a toutes les permissions"
              >
                Admin
              </th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 py-2 text-center align-top">
                  <div className="font-medium text-brand-900">{USER_ROLE_LABELS[r]}</div>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setAll(r, true)}
                      className="min-h-touch rounded px-1.5 text-xs text-brand-500 hover:bg-brand-100 hover:text-brand-900 disabled:opacity-50"
                    >
                      tout
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setAll(r, false)}
                      className="min-h-touch rounded px-1.5 text-xs text-brand-500 hover:bg-brand-100 hover:text-brand-900 disabled:opacity-50"
                    >
                      rien
                    </button>
                    <button
                      type="button"
                      disabled={busy || isDefault(r)}
                      onClick={() => reset.mutate(r)}
                      title="Rétablir la matrice par défaut de ce rôle"
                      className="min-h-touch rounded px-1.5 text-xs text-accent-700 hover:bg-accent-100/70 disabled:opacity-40"
                    >
                      défaut
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((mod) => (
              <ModuleRows
                key={mod.key}
                mod={mod}
                has={has}
                onToggle={toggle}
                onSetModule={setModule}
                busy={busy}
              />
            ))}
          </tbody>
        </table>
      </TableWrap>

      <p className="text-xs text-brand-400">
        « Utilisateurs / permissions » reste réservé à l'administrateur et ne se délègue pas.
      </p>
    </div>
  );
}

function ModuleRows({
  mod,
  has,
  onToggle,
  onSetModule,
  busy,
}: {
  mod: (typeof PERMISSION_MODULES)[number];
  has: (role: EditableRole, p: Permission) => boolean;
  onToggle: (role: EditableRole, p: Permission) => void;
  onSetModule: (role: EditableRole, modKey: string, on: boolean) => void;
  busy: boolean;
}) {
  return (
    <>
      <tr className="border-t border-brand-100 bg-brand-50/60">
        <th scope="rowgroup" className="px-3 py-2 text-left">
          <div className="font-semibold text-brand-900">{mod.label}</div>
          <div className="text-xs font-normal text-brand-400">{mod.hint}</div>
        </th>
        <td className="px-2 py-2 text-center text-brand-300" aria-hidden>
          ✓
        </td>
        {ROLES.map((r) => {
          const all = mod.actions.every((a) => has(r, `${mod.key}.${a}` as Permission));
          const none = mod.actions.every((a) => !has(r, `${mod.key}.${a}` as Permission));
          return (
            <td key={r} className="px-2 py-2 text-center">
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetModule(r, mod.key, !all)}
                aria-label={`${all ? "Retirer" : "Donner"} tout ${mod.label} à ${USER_ROLE_LABELS[r]}`}
                className={`min-h-touch rounded px-1.5 text-xs disabled:opacity-50 ${
                  all
                    ? "text-parc-800 hover:bg-parc-100"
                    : none
                      ? "text-brand-400 hover:bg-brand-100"
                      : "text-amber-700 hover:bg-amber-50"
                }`}
              >
                {all ? "tout" : none ? "rien" : "partiel"}
              </button>
            </td>
          );
        })}
      </tr>
      {mod.actions.map((a) => {
        const p = `${mod.key}.${a}` as Permission;
        const label = mod.actionLabels?.[a] ?? PERMISSION_ACTION_LABELS[a];
        return (
          <tr key={p} className="border-t border-brand-50">
            <td className="px-3 py-1 pl-6 text-brand-700">{label}</td>
            <td className="px-2 py-1 text-center">
              <input
                type="checkbox"
                checked
                readOnly
                disabled
                className="h-5 w-5 opacity-40"
                aria-label={`Admin — ${label}`}
              />
            </td>
            {ROLES.map((r) => (
              <td key={r} className="px-2 py-1 text-center">
                <label className="inline-flex min-h-touch w-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-accent-600"
                    checked={has(r, p)}
                    disabled={busy}
                    onChange={() => onToggle(r, p)}
                    aria-label={`${USER_ROLE_LABELS[r]} — ${mod.label} — ${label}`}
                  />
                </label>
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
