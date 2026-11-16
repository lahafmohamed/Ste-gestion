import { useEffect, useState } from "react";
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
import ConfirmDialog from "../ui/ConfirmDialog";
import { FormError, QueryError } from "../ui/Feedback";
import { SkeletonList } from "../ui/Skeleton";
import { TableWrap } from "../ui/Table";
import { IconCheck } from "../icons";

type EditableRole = Exclude<UserRole, "ADMIN">;
const ROLES: EditableRole[] = ["BUREAU", "PARC", "SCIERIE", "EXPORT"];

// Petites commandes de colonne (Tout / Rien / Défaut) : trois par rôle dans
// l'en-tête, un Button xs les rendrait trop larges pour quatre colonnes.
// Cible 44px quand même, focus visible comme partout.
const miniBtnCls =
  "min-h-touch rounded-lg px-2 text-sm font-medium transition-colors duration-150 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 " +
  "focus-visible:outline-accent-500 disabled:pointer-events-none disabled:opacity-40";

// Action de colonne qui réécrit toutes les permissions d'un rôle : confirmée
// d'abord, elle s'applique à tous les comptes du rôle dans les 30 secondes.
type Bulk = { role: EditableRole; kind: "all" | "none" | "default" };
const BULK_COPY: Record<Bulk["kind"], { title: string; body: string; confirm: string }> = {
  all: {
    title: "Tout autoriser",
    body: "Toutes les permissions seront données à ce rôle, suppressions comprises.",
    confirm: "Tout autoriser",
  },
  none: {
    title: "Tout retirer",
    body: "Ce rôle n'aura plus accès à aucun module. Ses comptes ne verront plus que le tableau de bord.",
    confirm: "Tout retirer",
  },
  default: {
    title: "Rétablir les valeurs par défaut",
    body: "Les cases de ce rôle reviennent à la matrice d'origine ; les ajustements faits ici sont perdus.",
    confirm: "Rétablir",
  },
};

/**
 * Matrice rôle × permission. Chaque case s'enregistre au clic (PUT de la liste
 * complète du rôle) ; la colonne ADMIN est affichée verrouillée : il a tout.
 * En tête de colonne : tout / rien / valeurs par défaut (PLAN §7).
 */
export default function PermissionsMatrix() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<Bulk | null>(null);
  // « Enregistré » affiché un instant après chaque envoi réussi : la case
  // bascule tout de suite (optimiste), seul ce mot dit que le serveur a suivi.
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

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
    onSuccess: (data) => {
      qc.setQueryData(["permissions", "roles"], data);
      setSavedAt(Date.now());
    },
    // Les comptes affichés portent leurs permissions effectives : à relire.
    onSettled: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const reset = useMutation({
    mutationFn: (role: EditableRole) => permissionsApi.resetRole(role),
    onSuccess: (data) => {
      setError(null);
      setSavedAt(Date.now());
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
  function runBulk(b: Bulk) {
    if (b.kind === "default") reset.mutate(b.role);
    else setAll(b.role, b.kind === "all");
    setBulk(null);
  }

  const busy = save.isPending || reset.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 max-w-prose flex-1 text-sm text-brand-600">
          Cochez ce que chaque rôle peut faire. « Voir » ouvre la page ; sans lui les autres cases
          du module n'ont pas d'effet dans l'interface. Chaque clic est enregistré aussitôt et
          s'applique aux comptes du rôle dans les 30 secondes.
        </p>
        {/* Zone toujours rendue : le lecteur d'écran annonce son changement. */}
        <p role="status" className="flex min-h-6 items-center gap-1.5 text-sm text-brand-600">
          {busy ? (
            "Enregistrement…"
          ) : savedAt ? (
            <>
              <IconCheck width={16} height={16} className="text-parc-700" />
              Enregistré
            </>
          ) : null}
        </p>
      </div>
      {error && <FormError>{error}</FormError>}

      <TableWrap stickyFirstCol className="rounded-xl bg-white shadow-card">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-100">
              <th className="px-3 py-2 text-left align-bottom font-normal text-brand-600">
                Module · action
              </th>
              <th
                className="px-2 py-2 text-center align-top font-medium text-brand-600"
                title="L'administrateur a toutes les permissions"
              >
                Admin
                <div className="mt-0.5 text-xs font-normal text-brand-500">tout, fixe</div>
              </th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 py-2 text-center align-top">
                  <div className="font-medium text-brand-900">{USER_ROLE_LABELS[r]}</div>
                  {/* Écart à la matrice d'origine, visible sans rien cliquer. */}
                  <div className="mt-0.5 text-xs font-normal text-brand-500">
                    {isDefault(r) ? "par défaut" : "ajusté"}
                  </div>
                  <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setBulk({ role: r, kind: "all" })}
                      aria-label={`Tout autoriser à ${USER_ROLE_LABELS[r]}`}
                      className={`${miniBtnCls} text-brand-600 hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200`}
                    >
                      Tout
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setBulk({ role: r, kind: "none" })}
                      aria-label={`Tout retirer à ${USER_ROLE_LABELS[r]}`}
                      className={`${miniBtnCls} text-brand-600 hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200`}
                    >
                      Rien
                    </button>
                    <button
                      type="button"
                      disabled={busy || isDefault(r)}
                      onClick={() => setBulk({ role: r, kind: "default" })}
                      title="Rétablir la matrice par défaut de ce rôle"
                      aria-label={`Rétablir les valeurs par défaut de ${USER_ROLE_LABELS[r]}`}
                      className={`${miniBtnCls} text-accent-700 hover:bg-accent-100/70 active:bg-accent-100`}
                    >
                      Défaut
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

      <p className="text-sm text-brand-600">
        « Utilisateurs / permissions » reste réservé à l'administrateur et ne se délègue pas.
      </p>

      <ConfirmDialog
        open={bulk !== null}
        tone={bulk?.kind === "none" ? "danger" : "primary"}
        title={bulk ? `${BULK_COPY[bulk.kind].title} — ${USER_ROLE_LABELS[bulk.role]}` : ""}
        confirmLabel={bulk ? BULK_COPY[bulk.kind].confirm : ""}
        pendingLabel="Enregistrement…"
        pending={busy}
        onConfirm={() => bulk && runBulk(bulk)}
        onCancel={() => setBulk(null)}
      >
        {bulk ? BULK_COPY[bulk.kind].body : null}
      </ConfirmDialog>
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
      {/* Fond opaque (pas /60) : la 1re cellule est figée au défilement et doit
          masquer ce qui glisse dessous ; le ! passe devant le bg-white que
          TableWrap impose aux cellules figées. */}
      <tr className="border-t border-brand-100 bg-brand-50">
        <th scope="rowgroup" className="!bg-brand-50 px-3 py-2 text-left">
          <div className="font-semibold text-brand-900">{mod.label}</div>
          <div className="text-xs font-normal text-brand-500">{mod.hint}</div>
        </th>
        <td className="px-2 py-2 text-center text-brand-500">
          <IconCheck width={18} height={18} className="mx-auto" />
          <span className="sr-only">Admin : tout {mod.label}</span>
        </td>
        {ROLES.map((r) => {
          const all = mod.actions.every((a) => has(r, `${mod.key}.${a}` as Permission));
          const none = mod.actions.every((a) => !has(r, `${mod.key}.${a}` as Permission));
          // Case du module, même vocabulaire que les cases d'action : cochée =
          // tout, vide = rien, tiret (indéterminée) = partiel. Le clic complète
          // un module partiel ou vide, et vide un module complet.
          return (
            <td key={r} className="px-2 py-2 text-center">
              <label
                className="inline-flex min-h-touch w-11 cursor-pointer items-center justify-center"
                title={all ? "Tout le module" : none ? "Rien du module" : "Module partiel"}
              >
                <input
                  type="checkbox"
                  className="size-5 accent-accent-600"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = !all && !none;
                  }}
                  disabled={busy}
                  onChange={() => onSetModule(r, mod.key, !all)}
                  aria-label={`${all ? "Retirer" : "Donner"} tout ${mod.label} à ${USER_ROLE_LABELS[r]}`}
                />
              </label>
            </td>
          );
        })}
      </tr>
      {mod.actions.map((a) => {
        const p = `${mod.key}.${a}` as Permission;
        const label = mod.actionLabels?.[a] ?? PERMISSION_ACTION_LABELS[a];
        return (
          <tr key={p} className="border-t border-brand-50">
            <td className="px-3 py-1 pl-6 text-brand-800">{label}</td>
            {/* Admin : coche fixe plutôt qu'une case grisée à peine lisible. */}
            <td className="px-2 py-1 text-center text-brand-500">
              <IconCheck width={16} height={16} className="mx-auto" />
              <span className="sr-only">Admin — {label} : autorisé</span>
            </td>
            {ROLES.map((r) => (
              <td key={r} className="px-2 py-1 text-center">
                <label className="inline-flex min-h-touch w-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-accent-600"
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
