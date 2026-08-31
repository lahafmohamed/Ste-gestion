import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { USER_ROLE_LABELS, UserRole, type UserCreateInput } from "@ste/shared";
import { usersApi } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { getUser } from "../lib/auth";
import Button from "../components/ui/Button";
import { FormError, QueryError } from "../components/ui/Feedback";
import Input, { Field } from "../components/ui/Input";
import SelectField from "../components/ui/SelectField";
import { SkeletonList } from "../components/ui/Skeleton";

const ROLES = UserRole.options;

export default function UsersPage() {
  const qc = useQueryClient();
  const me = getUser();
  const [showForm, setShowForm] = useState(false);
  const [v, setV] = useState({ name: "", email: "", password: "", role: "PARC" });
  const [error, setError] = useState<string | null>(null);

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes & rôles (réservé admin)."
        right={
          <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "Nouveau"}
          </Button>
        }
      />

      <div className="mx-auto max-w-page px-4 py-6 short:py-3">
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
            className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-brand-200 bg-white p-4 sm:grid-cols-4"
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

        <div className="space-y-2">
          {users.isLoading && <SkeletonList count={3} lines={1} />}
          {users.isError && (
            <QueryError error={users.error} onRetry={() => users.refetch()}>
              Impossible de charger les utilisateurs
            </QueryError>
          )}
          {users.data?.map((u) => (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-white p-3 ${
                u.active ? "" : "opacity-50"
              }`}
            >
              <div>
                <div className="font-medium text-brand-900">
                  {u.name}
                  {me?.id === u.id && <span className="ml-2 text-xs text-brand-400">(moi)</span>}
                </div>
                <div className="text-xs text-brand-500">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <SelectField
                  value={u.role}
                  disabled={me?.id === u.id}
                  onChange={(role) => update.mutate({ id: u.id, role: role as UserRole })}
                  width="auto"
                  aria-label={`Rôle de ${u.name}`}
                  options={ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
                />
                <Button
                  size="xs"
                  disabled={me?.id === u.id}
                  onClick={() => update.mutate({ id: u.id, active: !u.active })}
                >
                  {u.active ? "Désactiver" : "Activer"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
