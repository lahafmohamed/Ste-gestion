import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { USER_ROLE_LABELS, UserRole, type UserCreateInput, type UserDTO } from "@ste/shared";
import { usersApi } from "../lib/api";
import { useUser } from "../lib/auth";
import UserPermissions from "../components/admin/UserPermissions";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { EmptyState, FormError, Notice, QueryError } from "../components/ui/Feedback";
import Input, { Field } from "../components/ui/Input";
import SelectField from "../components/ui/SelectField";
import { SkeletonList } from "../components/ui/Skeleton";
import { IconPlus, IconX } from "../components/icons";

const ROLES = UserRole.options;
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }));
// Même plancher que l'API (userCreateSchema / userUpdateSchema).
const PASSWORD_MIN = 6;

/** Comptes & rôles — onglet « Utilisateurs » de l'administration. */
export default function UsersSection() {
  const qc = useQueryClient();
  const me = useUser();
  const [showForm, setShowForm] = useState(false);
  const [v, setV] = useState({ name: "", email: "", password: "", role: "PARC" });
  const [error, setError] = useState<string | null>(null);
  // Confirmation transitoire (« Compte créé », « Mot de passe changé ») : sans
  // elle, le formulaire se referme et rien ne dit que l'envoi a réussi.
  const [done, setDone] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Désactiver coupe l'accès immédiatement : on confirme d'abord.
  const [toDisable, setToDisable] = useState<UserDTO | null>(null);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);

  const users = useQuery({ queryKey: ["users"], queryFn: usersApi.list });

  const create = useMutation({
    mutationFn: (data: UserCreateInput) => usersApi.create(data),
    onSuccess: (u) => {
      setV({ name: "", email: "", password: "", role: "PARC" });
      setShowForm(false);
      setError(null);
      setDone(`Compte de ${u.name} créé. Transmettez-lui son email et son mot de passe.`);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      role?: UserRole;
      active?: boolean;
      password?: string;
    }) => usersApi.update(id, data),
    onSuccess: (u, vars) => {
      setError(null);
      setToDisable(null);
      if (vars.password) setDone(`Mot de passe de ${u.name} changé.`);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => {
      setToDisable(null);
      setError(e.message);
    },
  });

  const list = users.data ?? [];
  const activeCount = list.filter((u) => u.active).length;
  // Carte en cours d'enregistrement : ses commandes se figent le temps du PATCH.
  const pendingId = update.isPending ? update.variables?.id : undefined;

  return (
    <div className="max-w-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-brand-600">
          Le rôle donne les permissions de base ; « Permissions » ajuste compte par compte.
        </p>
        <Button
          variant={showForm ? "secondary" : "primary"}
          size="sm"
          onClick={() => setShowForm((s) => !s)}
          aria-expanded={showForm}
        >
          {showForm ? (
            <>
              <IconX width={16} height={16} className="-ml-0.5" />
              Annuler
            </>
          ) : (
            <>
              <IconPlus width={16} height={16} className="-ml-0.5" />
              Nouveau compte
            </>
          )}
        </Button>
      </div>

      {done && (
        <div role="status" className="mb-3">
          <Notice tone="success">{done}</Notice>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              name: v.name.trim(),
              email: v.email.trim(),
              password: v.password,
              role: v.role as UserRole,
            });
          }}
          className="mb-6 rounded-xl bg-white p-4 shadow-card motion-safe:animate-rise-in"
        >
          <h2 className="text-base font-semibold text-brand-900">Nouveau compte</h2>
          {/* Téléphone : une colonne (un email ne tient pas dans une demi-largeur). */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Nom">
              <Input
                required
                autoFocus
                autoComplete="off"
                value={v.name}
                onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                inputMode="email"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                value={v.email}
                onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label={`Mot de passe (${PASSWORD_MIN} caractères minimum)`}>
              <Input
                type="text"
                required
                minLength={PASSWORD_MIN}
                autoCapitalize="none"
                autoComplete="new-password"
                spellCheck={false}
                value={v.password}
                onChange={(e) => setV((p) => ({ ...p, password: e.target.value }))}
              />
            </Field>
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-brand-600">Rôle</span>
              <SelectField
                value={v.role}
                onChange={(role) => setV((p) => ({ ...p, role }))}
                aria-label="Rôle du nouveau compte"
                options={ROLE_OPTIONS}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            {error && (
              <div className="min-w-0 flex-1">
                <FormError>{error}</FormError>
              </div>
            )}
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? "Création…" : "Créer le compte"}
            </Button>
          </div>
        </form>
      )}

      {!showForm && error && (
        <div className="mb-3">
          <FormError>{error}</FormError>
        </div>
      )}

      {users.isLoading ? (
        <SkeletonList count={3} lines={1} />
      ) : users.isError ? (
        <QueryError error={users.error} onRetry={() => users.refetch()}>
          Impossible de charger les utilisateurs
        </QueryError>
      ) : list.length === 0 ? (
        <EmptyState>Aucun compte pour l'instant.</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-brand-600">
            {list.length} compte{list.length > 1 ? "s" : ""} · {activeCount} actif
            {activeCount > 1 ? "s" : ""}
          </p>
          <ul className="space-y-2">
            {list.map((u) => (
              <li key={u.id}>
                <UserCard
                  u={u}
                  isMe={me?.id === u.id}
                  busy={pendingId === u.id}
                  open={openId === u.id}
                  onToggleOpen={() => setOpenId((cur) => (cur === u.id ? null : u.id))}
                  onRole={(role) => update.mutate({ id: u.id, role })}
                  onActive={(active) =>
                    active ? update.mutate({ id: u.id, active }) : setToDisable(u)
                  }
                  onPassword={(password, onSaved) =>
                    update.mutate({ id: u.id, password }, { onSuccess: onSaved })
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={toDisable !== null}
        title={`Désactiver le compte de ${toDisable?.name ?? ""} ?`}
        confirmLabel="Désactiver"
        pendingLabel="Désactivation…"
        pending={update.isPending}
        onConfirm={() => toDisable && update.mutate({ id: toDisable.id, active: false })}
        onCancel={() => setToDisable(null)}
      >
        Ce compte ne pourra plus se connecter. Ses saisies passées restent intactes, et il peut
        être réactivé à tout moment.
      </ConfirmDialog>
    </div>
  );
}

function UserCard({
  u,
  isMe,
  busy,
  open,
  onToggleOpen,
  onRole,
  onActive,
  onPassword,
}: {
  u: UserDTO;
  isMe: boolean;
  busy: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onRole: (role: UserRole) => void;
  onActive: (active: boolean) => void;
  /** onSaved : appelé seulement si l'API accepte — sur échec le champ reste ouvert. */
  onPassword: (password: string, onSaved: () => void) => void;
}) {
  const overrides = (u.permissionsGranted?.length ?? 0) + (u.permissionsRevoked?.length ?? 0);
  const [resetting, setResetting] = useState(false);
  const [pwd, setPwd] = useState("");
  const pwdId = `pwd-${u.id}`;
  const panelId = `perms-${u.id}`;

  function closeReset() {
    setResetting(false);
    setPwd("");
  }

  return (
    // Compte désactivé : carte en retrait (aplat papier), lisible mais secondaire.
    <div className={`rounded-xl shadow-card ${u.active ? "bg-white" : "bg-brand-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-medium ${u.active ? "text-brand-900" : "text-brand-600"}`}>
              {u.name}
            </span>
            {isMe && <Badge tone="accent">Vous</Badge>}
            {!u.active && <Badge tone="brand">Désactivé</Badge>}
          </div>
          <div className="truncate text-sm text-brand-500">{u.email}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Son propre rôle et son propre compte ne se modifient pas : un
              admin qui se rétrograde par erreur perdrait l'administration. */}
          <SelectField
            value={u.role}
            disabled={isMe || busy}
            onChange={(role) => onRole(role as UserRole)}
            width="auto"
            aria-label={`Rôle de ${u.name}`}
            options={ROLE_OPTIONS}
          />
          <Button
            size="xs"
            onClick={onToggleOpen}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
          >
            Permissions
            {overrides > 0 && (
              <Badge tone="amber">
                {overrides}
                <span className="sr-only"> surcharge{overrides > 1 ? "s" : ""}</span>
              </Badge>
            )}
          </Button>
          <Button
            size="xs"
            disabled={busy}
            onClick={() => setResetting((r) => !r)}
            aria-expanded={resetting}
          >
            Mot de passe
          </Button>
          <Button
            size="xs"
            variant={u.active ? "ghost-danger" : "secondary"}
            disabled={isMe || busy}
            onClick={() => onActive(!u.active)}
          >
            {u.active ? "Désactiver" : "Réactiver"}
          </Button>
        </div>
      </div>

      {resetting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pwd.length < PASSWORD_MIN) return;
            onPassword(pwd, closeReset);
          }}
          className="flex flex-wrap items-end gap-2 border-t border-brand-100 p-3 sm:px-4"
        >
          <label htmlFor={pwdId} className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-brand-600">
              Nouveau mot de passe ({PASSWORD_MIN} caractères minimum)
            </span>
            <Input
              id={pwdId}
              type="text"
              autoFocus
              autoCapitalize="none"
              autoComplete="new-password"
              spellCheck={false}
              minLength={PASSWORD_MIN}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || pwd.length < PASSWORD_MIN}
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button onClick={closeReset}>Annuler</Button>
        </form>
      )}

      {open && (
        <div id={panelId} className="border-t border-brand-100 p-3 sm:p-4">
          <UserPermissions user={u} />
        </div>
      )}
    </div>
  );
}
