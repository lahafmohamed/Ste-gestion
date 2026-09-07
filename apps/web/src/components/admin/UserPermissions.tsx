import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULES,
  USER_ROLE_LABELS,
  type Permission,
  type UserDTO,
} from "@ste/shared";
import { permissionsApi, usersApi } from "../../lib/api";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { FormError } from "../ui/Feedback";
import { SkeletonList } from "../ui/Skeleton";

/**
 * Surcharges d'un compte par rapport à son rôle : chaque case montre la
 * permission effective ; la décocher alors que le rôle la donne crée un
 * retrait, la cocher alors que le rôle ne la donne pas crée un ajout. Cliquer
 * à nouveau retire la surcharge (retour au rôle).
 */
export default function UserPermissions({ user }: { user: UserDTO }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const matrix = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: permissionsApi.roles,
  });

  const update = useMutation({
    mutationFn: (data: { permissionsGranted: Permission[]; permissionsRevoked: Permission[] }) =>
      usersApi.update(user.id, data),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (user.role === "ADMIN") {
    return (
      <p className="text-sm text-brand-500">
        Administrateur : toutes les permissions, sans surcharge possible.
      </p>
    );
  }
  if (matrix.isLoading) return <SkeletonList count={3} lines={1} />;
  if (!matrix.data) return <FormError>Matrice des rôles indisponible.</FormError>;

  const fromRole = new Set(matrix.data[user.role]);
  const granted = new Set(user.permissionsGranted ?? []);
  const revoked = new Set(user.permissionsRevoked ?? []);
  const effective = (p: Permission) => (fromRole.has(p) || granted.has(p)) && !revoked.has(p);
  const overrideCount = granted.size + revoked.size;

  function toggle(p: Permission) {
    const g = new Set(granted);
    const r = new Set(revoked);
    if (g.has(p) || r.has(p)) {
      // Surcharge existante : on la retire, le rôle reprend la main.
      g.delete(p);
      r.delete(p);
    } else if (fromRole.has(p)) {
      r.add(p);
    } else {
      g.add(p);
    }
    update.mutate({ permissionsGranted: [...g], permissionsRevoked: [...r] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-brand-500">
        <span>
          Hérite du rôle{" "}
          <strong className="font-medium text-brand-700">{USER_ROLE_LABELS[user.role]}</strong>
          {overrideCount > 0
            ? ` · ${overrideCount} surcharge${overrideCount > 1 ? "s" : ""}`
            : " · aucune surcharge"}
        </span>
        {overrideCount > 0 && (
          <Button
            size="xs"
            disabled={update.isPending}
            onClick={() => update.mutate({ permissionsGranted: [], permissionsRevoked: [] })}
          >
            Revenir au rôle
          </Button>
        )}
      </div>
      {error && <FormError>{error}</FormError>}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {PERMISSION_MODULES.map((mod) => (
          <fieldset key={mod.key} className="min-w-0">
            <legend className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              {mod.label}
            </legend>
            <div className="mt-1 space-y-0.5">
              {mod.actions.map((a) => {
                const p = `${mod.key}.${a}` as Permission;
                const on = effective(p);
                const isGrant = granted.has(p);
                const isRevoke = revoked.has(p);
                return (
                  <label
                    key={p}
                    className="flex min-h-touch cursor-pointer items-center gap-2 rounded-lg px-1 text-sm text-brand-700 hover:bg-brand-50"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-accent-600"
                      checked={on}
                      disabled={update.isPending}
                      onChange={() => toggle(p)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {mod.actionLabels?.[a] ?? PERMISSION_ACTION_LABELS[a]}
                    </span>
                    {isGrant && <Badge tone="parc">ajout</Badge>}
                    {isRevoke && <Badge tone="amber">retrait</Badge>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
