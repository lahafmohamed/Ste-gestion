import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VehicleDTO, VehicleUpdateInput } from "@ste/shared";
import { plateKey } from "@ste/shared";
import { vehiclesApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { PageHeader } from "../components/Layout";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { EmptyState, FormError, QueryError, Notice } from "../components/ui/Feedback";
import Input, { Field, SearchInput } from "../components/ui/Input";
import { SkeletonList } from "../components/ui/Skeleton";
import { IconPlus } from "../components/icons";

// Le parc de camions — référentiel du portail. Les mêmes camions reviennent
// voyage après voyage : ils se saisissent ici une fois, et la Réception les
// choisit dans une liste au lieu de retaper l'immatriculation.
//
// Le parc s'amorce aussi tout seul : une immat saisie à la main à la réception
// crée sa fiche. Cette page sert alors à la compléter (code, chauffeur) et à
// faire le ménage (doublons d'écriture, camions sortis du service).

const EMPTY = { registration: "", code: "", brand: "", driver: "", trailer: "" };
type Form = typeof EMPTY;

function toForm(v: VehicleDTO): Form {
  return {
    registration: v.registration,
    code: v.code ?? "",
    brand: v.brand ?? "",
    driver: v.driver ?? "",
    trailer: v.trailer ?? "",
  };
}

/** Champs vidés → `null` (détachés), jamais des chaînes vides en base. */
function toPayload(f: Form) {
  return {
    registration: f.registration.trim(),
    code: f.code.trim() || null,
    brand: f.brand.trim() || null,
    driver: f.driver.trim() || null,
    trailer: f.trailer.trim() || null,
  };
}

const FIELDS = [
  ["code", "Code", "STE-01"],
  ["brand", "Marque", "RENAULT"],
  ["driver", "Chauffeur", "KONATE MADOU"],
  ["trailer", "Remorque", "7794 F3 01"],
] as const;

export default function CamionsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [showForm, setShowForm] = useState(false);
  const [v, setV] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Form>(EMPTY);
  const [editError, setEditError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<VehicleDTO | null>(null);

  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: vehiclesApi.list });

  // Un camion ajouté ou renommé change les choix de la réception et les immats
  // affichées sur les bordereaux déjà enregistrés.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["vehicles"] });
    qc.invalidateQueries({ queryKey: ["trucks"] });
  };

  const create = useMutation({
    mutationFn: () => vehiclesApi.create(toPayload(v)),
    onSuccess: () => {
      setV(EMPTY);
      setShowForm(false);
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VehicleUpdateInput }) =>
      vehiclesApi.update(id, data),
    onSuccess: () => {
      setEditingId(null);
      setEditError(null);
      refresh();
    },
    onError: (e: Error) => setEditError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => vehiclesApi.remove(id),
    onSuccess: () => {
      setToDelete(null);
      refresh();
    },
    onError: (e: Error) => {
      setToDelete(null);
      setEditError(e.message);
    },
  });

  // Immat déjà au parc ? Bloquant côté API (409) — le dire pendant la frappe,
  // avec la fiche existante, évite un aller-retour pour rien.
  const key = plateKey(v.registration);
  const dup = key ? vehicles.data?.find((x) => x.plateKey === key) : undefined;

  const needle = q.trim().toLowerCase();
  const shown = (vehicles.data ?? []).filter((x) =>
    needle === ""
      ? true
      : [x.registration, x.code, x.brand, x.driver, x.trailer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
  );

  return (
    <>
      <PageHeader
        wide={false}
        title="Camions"
        right={
          can("camions.create") && (
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setShowForm((s) => !s);
            }}
          >
            {showForm ? "Fermer" : <><IconPlus width={16} height={16} className="-ml-0.5" />Camion</>}
          </Button>
          )
        }
      />

      <div className="mx-auto max-w-page px-4 py-6 short:py-3">
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="mb-4 rounded-xl bg-white shadow-card p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Immatriculation">
                <Input
                  required
                  autoFocus
                  value={v.registration}
                  onChange={(e) => setV((p) => ({ ...p, registration: e.target.value }))}
                  placeholder="3201 GS 01"
                />
              </Field>
              {FIELDS.map(([field, label, ph]) => (
                <Field key={field} label={label}>
                  <Input
                    value={v[field]}
                    onChange={(e) => setV((p) => ({ ...p, [field]: e.target.value }))}
                    placeholder={ph}
                  />
                </Field>
              ))}
            </div>

            {dup && (
              <Notice tone="warn" className="mt-2">
                {dup.registration} est déjà au parc — la même plaque écrite
                autrement reste le même camion.
              </Notice>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              {error && <FormError>{error}</FormError>}
              <Button
                type="submit"
                variant="primary"
                disabled={create.isPending || !!dup}
                className="ml-auto"
              >
                {create.isPending ? "Enregistrement…" : "Ajouter au parc"}
              </Button>
            </div>
          </form>
        )}

        {(vehicles.data?.length ?? 0) > 5 && (
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Immatriculation, code, chauffeur…"
            aria-label="Chercher un camion"
            className="mb-2"
          />
        )}

        <div className="space-y-2">
          {vehicles.isLoading && <SkeletonList count={3} lines={1} />}
          {vehicles.isError && (
            <QueryError error={vehicles.error} onRetry={() => vehicles.refetch()}>
              Impossible de charger les camions
            </QueryError>
          )}
          {vehicles.data?.length === 0 && !showForm && (
            <EmptyState
              action={
                can("camions.create") && (
                  <Button variant="primary" onClick={() => setShowForm(true)}>
                    <IconPlus width={16} height={16} className="-ml-0.5" />
                    Camion
                  </Button>
                )
              }
            >
              Aucun camion au parc. Les camions saisis à la réception s'ajoutent aussi
              d'eux-mêmes ici.
            </EmptyState>
          )}
          {(vehicles.data?.length ?? 0) > 0 && shown.length === 0 && (
            <EmptyState>Aucun camion ne correspond.</EmptyState>
          )}

          {shown.map((x) =>
            editingId === x.id ? (
              <Card key={x.id} pad="sm" className="ring-2 ring-accent-500">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    update.mutate({ id: x.id, data: toPayload(edit) });
                  }}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Immatriculation">
                      <Input
                        required
                        value={edit.registration}
                        onChange={(e) =>
                          setEdit((p) => ({ ...p, registration: e.target.value }))
                        }
                      />
                    </Field>
                    {FIELDS.map(([field, label, ph]) => (
                      <Field key={field} label={label}>
                        <Input
                          value={edit[field]}
                          onChange={(e) => setEdit((p) => ({ ...p, [field]: e.target.value }))}
                          placeholder={ph}
                        />
                      </Field>
                    ))}
                  </div>
                  {/* Corriger la plaque corrige aussi les bordereaux déjà saisis :
                      c'est le même camion, la faute de frappe n'a pas à survivre. */}
                  {x.tripCount > 0 && edit.registration.trim() !== x.registration && (
                    <Notice tone="warn" className="mt-2">
                      {x.tripCount} réception{x.tripCount > 1 ? "s" : ""} porteront la
                      nouvelle immatriculation.
                    </Notice>
                  )}
                  {editError && (
                    <div className="mt-2">
                      <FormError>{editError}</FormError>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* Sortir un camion du parc est rare et se paie en réceptions
                        impossibles : l'action vit ici, sous « Modifier », hors du
                        chemin du pouce qui parcourt la liste.
                        Un camion qui a roulé ne se supprime pas — ses voyages
                        perdraient leur fiche. Il se retire du choix. */}
                    {x.tripCount > 0 ? (
                      <Button
                        size="xs"
                        variant="ghost-danger"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: x.id, data: { active: !x.active } })}
                      >
                        {x.active ? "Retirer du parc" : "Remettre au parc"}
                      </Button>
                    ) : (
                      can("camions.delete") && (
                        <Button size="xs" variant="ghost-danger" onClick={() => setToDelete(x)}>
                          Supprimer
                        </Button>
                      )
                    )}
                    <Button className="ml-auto" onClick={() => setEditingId(null)}>
                      Annuler
                    </Button>
                    <Button type="submit" variant="primary" disabled={update.isPending}>
                      {update.isPending ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  </div>
                </form>
              </Card>
            ) : (
              <Card key={x.id} pad="sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${x.active ? "text-brand-900" : "text-brand-500"}`}>
                        {x.registration}
                      </span>
                      {x.code && <Badge tone="accent">{x.code}</Badge>}
                      {!x.active && <Badge>Retiré</Badge>}
                      {x.tripCount > 0 ? (
                        <Badge tone="parc">
                          {x.tripCount} voyage{x.tripCount > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge tone="amber">Jamais reçu</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-brand-500">
                      {[x.brand, x.driver || "Chauffeur non renseigné"]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {x.lastTripAt && (
                      <div className="mt-0.5 text-sm text-brand-500">
                        Dernier voyage le {new Date(x.lastTripAt).toLocaleDateString("fr-FR")}
                      </div>
                    )}
                  </div>

                  {can("camions.edit") && (
                    <Button
                      size="xs"
                      className="shrink-0"
                      onClick={() => {
                        setEditError(null);
                        setEdit(toForm(x));
                        setEditingId(x.id);
                      }}
                    >
                      Modifier
                    </Button>
                  )}
                </div>
              </Card>
            )
          )}
        </div>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Supprimer ${toDelete?.registration ?? ""} ?`}
        confirmLabel="Supprimer"
        pending={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        Ce camion n'a encore aucune réception — sa fiche part sans rien emporter.
      </ConfirmDialog>
    </>
  );
}
