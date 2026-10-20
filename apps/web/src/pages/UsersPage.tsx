import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { USER_ROLE_LABELS, UserRole, type UserCreateInput, type UserDTO } from "@ste/shared";
import { usersApi } from "../lib/api";
import { useUser } from "../lib/auth";
import UserPermissions from "../components/admin/UserPermissions";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { FormError, QueryError } from "../components/ui/Feedback";
import Input, { Field } from "../components/ui/Input";
import SelectField from "../components/ui/SelectField";
import { SkeletonList } from "../components/ui/Skeleton";
import { IconPlus } from "../components/icons";

const ROLES = UserRole.options;

/** Comptes & rôles — onglet « Utilisateurs » de l'administration. */
export default function UsersSection() {
  const qc = useQueryClient();
  const me = useUser();
  const [showForm, setShowForm] = useState(false);
  const [v, setV] = useState({ name: "", email: "", password: "", role: "PARC" });
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: usersApi.list });

  const create = useMutation({
    mutationFn: (data: UserCreateInput) => usersApi.create(data),
    onSuccess: () => {
      setV({ name: "", email: "", password: "", role: "PARC" });
      setShowForm(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; role?: UserRole; active?: boolean }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="max-w-page">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-600">
          Le rôle donne les permissions de base ; « Permissions » ajuste compte par compte.
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Fermer" : <><IconPlus width={16} height={16} className="-ml-0.5" />Compte</>}
        </Button>
      </div>

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
          className="mb-6 grid grid-cols-2 gap-3 rounded-xl bg-white shadow-card p-4 sm:grid-cols-4"
        >
          <Field label="Nom">
            <Input
              required
              value={v.name}
              onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              required
              value={v.email}
              onChange={(e) => setV((p) => ({ ...p, email: e.target.value }))}
            />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              required
              minLength={6}
              value={v.password}
              onChange={(e) => setV((p) => ({ ...p, password: e.target.value }))}
            />
          </Field>
          <Field label="Rôle">
            <SelectField
              value={v.role}
              onChange={(role) => setV((p) => ({ ...p, role }))}
              aria-label="Rôle du nouvel utilisateur"
              options={ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
            />
          </Field>
          <div className="col-span-2 flex items-center justify-between sm:col-span-4">
            {error && <FormError>{error}</FormError>}
            <Button type="submit" variant="primary" disabled={create.isPending} className="ml-auto">
              Créer
            </Button>
          </div>
        </form>
      )}

      {!showForm && error && (
        <div className="mb-3">
          <FormError>{error}</FormError>
        </div>
      )}

      <div className="space-y-2">
        {users.isLoading && <SkeletonList count={3} lines={1} />}
        {users.isError && (
          <QueryError error={users.error} onRetry={() => users.refetch()}>
            Impossible de charger les utilisateurs
          </QueryError>
        )}
        {users.data?.map((u) => (
          <UserCard
            key={u.id}
            u={u}
            isMe={me?.id === u.id}
            open={openId === u.id}
            onToggleOpen={() => setOpenId((cur) => (cur === u.id ? null : u.id))}
            onRole={(role) => update.mutate({ id: u.id, role })}
            onActive={(active) => update.mutate({ id: u.id, active })}
          />
        ))}
      </div>
    </div>
  );
}

function UserCard({
  u,
  isMe,
  open,
  onToggleOpen,
  onRole,
  onActive,
}: {
  u: UserDTO;
  isMe: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onRole: (role: UserRole) => void;
  onActive: (active: boolean) => void;
}) {
  const overrides = (u.permissionsGranted?.length ?? 0) + (u.permissionsRevoked?.length ?? 0);
  return (
    <div className="rounded-xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className={`font-medium ${u.active ? "text-brand-900" : "text-brand-500"}`}>
            {u.name}
            {isMe && <span className="ml-2 text-xs text-brand-500">(moi)</span>}
            {!u.active && (
              <Badge tone="brand" className="ml-2">
                désactivé
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-brand-500">{u.email}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectField
            value={u.role}
            disabled={isMe}
            onChange={(role) => onRole(role as UserRole)}
            width="auto"
            aria-label={`Rôle de ${u.name}`}
            options={ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
          />
          <Button size="xs" onClick={onToggleOpen} aria-expanded={open}>
            Permissions
            {overrides > 0 && (
              <Badge tone="amber" className="ml-1.5">
                {overrides}
              </Badge>
            )}
          </Button>
          <Button size="xs" disabled={isMe} onClick={() => onActive(!u.active)}>
            {u.active ? "Désactiver" : "Activer"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-brand-100 p-3">
          <UserPermissions user={u} />
        </div>
      )}
    </div>
  );
}
