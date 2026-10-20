import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONTAINER_STATUS_LABELS,
  containerPieceCount,
  containerSections,
  containerTotalM3,
  type ContainerDTO,
  type ContainerStatus,
  type TruckDTO,
} from "@ste/shared";
import { containersApi, contractsApi, downloadFile, trucksApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtDec3, fmtM3, fmtNum } from "../lib/format";
import { printContainerPackingList } from "../lib/printPacking";
import EmpotagePicker from "./EmpotagePicker";
import Badge, { type BadgeTone } from "./ui/Badge";
import Button from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import Chip from "./ui/Chip";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field } from "./ui/Input";
import { IconChevronDown, IconPlus, IconX } from "./icons";

// Puces de sélection multi-camions (origine des débités empotés).
function TruckChips({
  trucks,
  selected,
  onToggle,
}: {
  trucks: TruckDTO[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (trucks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {trucks.map((t) => (
        <Chip key={t.id} selected={selected.includes(t.id)} onClick={() => onToggle(t.id)}>
          {t.registration}
        </Chip>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<ContainerStatus, BadgeTone> = {
  PLANNED: "brand",
  LOADING: "amber",
  LOADED: "info",
  SHIPPED: "parc",
};

const STATUSES: ContainerStatus[] = ["PLANNED", "LOADING", "LOADED", "SHIPPED"];

function CreateForm({ trucks, onDone }: { trucks: TruckDTO[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    containerNo: "",
    sealNo: "",
    fauxSealNo: "",
    bookingNo: "",
    grade: "",
    destination: "",
  });
  const [truckIds, setTruckIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: containersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers"] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          containerNo: v.containerNo.trim(),
          sealNo: v.sealNo.trim() || undefined,
          fauxSealNo: v.fauxSealNo.trim() || undefined,
          bookingNo: v.bookingNo.trim() || undefined,
          grade: v.grade.trim() || undefined,
          destination: v.destination.trim() || undefined,
          truckIds: truckIds.length ? truckIds : undefined,
        });
      }}
      className="mb-3 rounded-xl bg-white shadow-card p-4"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["containerNo", "N° conteneur", "MRKU 684202-0", true],
            ["sealNo", "N° plomb", "ML-CI 1238871", false],
            ["fauxSealNo", "Faux plomb", "STE 0523", false],
            ["bookingNo", "Booking", "270377830", false],
            ["grade", "Grade", "5X3 B GRADE", false],
            ["destination", "Destination", "MANGALORE", false],
          ] as const
        ).map(([key, label, ph, required]) => (
          <Field key={key} label={label}>
            <Input
              required={required}
              value={v[key]}
              onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))}
              placeholder={ph}
            />
          </Field>
        ))}
      </div>
      {trucks.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-brand-500">Camions d'origine (optionnel)</div>
          <TruckChips
            trucks={trucks}
            selected={truckIds}
            onToggle={(id) =>
              setTruckIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
            }
          />
        </div>
      )}
      <div className="mt-3 border-t border-brand-100 pt-3">
        {error && (
          <div className="mb-2">
            <FormError>{error}</FormError>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            Créer le conteneur
          </Button>
        </div>
      </div>
    </form>
  );
}

function ContainerCard({
  c,
  trucks,
  contractCode,
}: {
  c: ContainerDTO;
  trucks: TruckDTO[];
  contractCode?: string;
}) {
  const qc = useQueryClient();
  const can = useCan();
  const canEdit = can("empotage.edit");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editTrucks, setEditTrucks] = useState(false);
  // Confirmation lisible sur tablette (remplace window.confirm).
  const [delOpen, setDelOpen] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["containers"] });
    // Le panier lit le stock général restant : il doit refléter ce qui vient
    // d'être empoté, sur toutes les vues.
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }

  const linkedRegs = trucks.filter((t) => c.truckIds.includes(t.id)).map((t) => t.registration);
  const sections = containerSections(c);

  const addItems = useMutation({
    mutationFn: (items: { lengthFt: string; widthIn: string; thicknessIn: string; count: number }[]) =>
      containersApi.addItems(c.id, { items }),
    onSuccess: () => {
      setAdding(false);
      invalidate();
    },
  });
  const setTrucks = useMutation({
    mutationFn: (truckIds: string[]) => containersApi.update(c.id, { truckIds }),
    onSuccess: () => {
      setEditTrucks(false);
      invalidate();
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: ContainerStatus) => containersApi.update(c.id, { status }),
    onSuccess: invalidate,
  });
  const removeItem = useMutation({
    mutationFn: containersApi.removeItem,
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => containersApi.remove(c.id), onSuccess: invalidate });

  return (
    <div className="rounded-xl bg-white shadow-card">
      {/* En-tête dépliable : le chevron dit qu'il y a un détail dessous (sans
          lui, rien ne distinguait la carte d'une simple ligne). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-touch w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100 ${
          open ? "rounded-t-xl" : "rounded-xl"
        }`}
      >
        {/* Statut à côté du n° : la colonne de droite ne garde que les chiffres,
            le n° de conteneur ne se coupe plus sur téléphone. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="whitespace-nowrap font-semibold text-brand-900">{c.containerNo}</span>
            <Badge tone={STATUS_TONE[c.status]} className="whitespace-nowrap">
              {CONTAINER_STATUS_LABELS[c.status]}
            </Badge>
          </div>
          <div className="mt-0.5 text-sm text-brand-600">
            {[
              c.grade,
              c.destination,
              c.sealNo && `plomb ${c.sealNo}`,
              c.fauxSealNo && `faux plomb ${c.fauxSealNo}`,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-right">
          <div>
            <div className="whitespace-nowrap text-sm font-semibold text-brand-900">
              {fmtM3(containerTotalM3(c))}
            </div>
            {/* Contenu visible sans déplier : pièces + sections l×ép. */}
            {c.items.length > 0 && (
              <div className="whitespace-nowrap text-xs text-brand-500">
                {fmtNum(containerPieceCount(c))} pièces
                <span className="hidden sm:inline">
                  {" "}
                  · {sections.length} section{sections.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
          <IconChevronDown
            width={18}
            height={18}
            className={`shrink-0 text-brand-500 transition-transform duration-150 ease-out motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-brand-100 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-brand-500">Statut :</span>
            {STATUSES.map((st) => (
              <Chip
                key={st}
                selected={c.status === st}
                disabled={!canEdit}
                onClick={() => setStatus.mutate(st)}
              >
                {CONTAINER_STATUS_LABELS[st]}
              </Chip>
            ))}
            <Button
              size="xs"
              onClick={() =>
                printContainerPackingList(c, {
                  contractCode,
                  truckRegistrations: linkedRegs,
                })
              }
              disabled={c.items.length === 0}
            >
              Imprimer packing list
            </Button>
            {can("contracts.export") && (
              <Button
                size="xs"
                onClick={() =>
                  downloadFile(
                    `/containers/${c.id}/export.xlsx`,
                    `empotage-${c.containerNo.replace(/[\s/]+/g, "-")}.xlsx`,
                  )
                }
                disabled={c.items.length === 0}
              >
                Exporter Excel
              </Button>
            )}
            {can("empotage.delete") && (
              <button
                onClick={() => setDelOpen(true)}
                className="ml-auto min-h-touch rounded-lg px-2 text-sm text-brand-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
              >
                Supprimer conteneur
              </button>
            )}
            <ConfirmDialog
              open={delOpen}
              title={`Supprimer le conteneur ${c.containerNo} ?`}
              confirmLabel="Supprimer le conteneur"
              pending={remove.isPending}
              onConfirm={() => {
                remove.mutate();
                setDelOpen(false);
              }}
              onCancel={() => setDelOpen(false)}
            >
              {c.items.length} ligne{c.items.length > 1 ? "s" : ""} d'empotage seront effacées.
              Action irréversible.
            </ConfirmDialog>
          </div>

          {/* Camions d'origine (traçabilité) */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-brand-500">Camions d'origine :</span>
            {editTrucks ? (
              <div className="flex flex-1 flex-col gap-2">
                <TruckChips
                  trucks={trucks}
                  selected={c.truckIds}
                  onToggle={(id) => {
                    const next = c.truckIds.includes(id)
                      ? c.truckIds.filter((x) => x !== id)
                      : [...c.truckIds, id];
                    setTrucks.mutate(next);
                  }}
                />
                <button
                  onClick={() => setEditTrucks(false)}
                  className="min-h-touch self-start rounded-lg px-2 text-brand-500 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                {linkedRegs.length ? (
                  linkedRegs.map((r) => <Badge key={r}>{r}</Badge>)
                ) : (
                  <span className="text-brand-500">aucun</span>
                )}
                {trucks.length > 0 && canEdit && (
                  <button
                    onClick={() => setEditTrucks(true)}
                    className="min-h-touch rounded-lg px-2 text-brand-500 underline hover:text-brand-900 active:bg-brand-100"
                  >
                    Modifier
                  </button>
                )}
              </>
            )}
          </div>

          {c.items.length > 0 && (
            <div className="-mx-3 overflow-x-auto px-3 scroll-shadow-x">
            <table className="w-full min-w-[480px] text-base">
              <thead>
                <tr className="text-left text-xs text-brand-500">
                  <th className="py-1 font-normal">#</th>
                  <th className="py-1 font-normal">Long. (ft)</th>
                  <th className="py-1 font-normal">Taille</th>
                  <th className="py-1 text-right font-normal">Nbr</th>
                  <th className="py-1 text-right font-normal">m³</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <Fragment key={sec.key}>
                    {/* En-tête de section l×ép — le doc d'empotage se lit par paquets. */}
                    <tr className="border-t border-brand-200 bg-brand-50">
                      <td colSpan={3} className="py-1 text-sm font-medium text-brand-700">
                        Section {fmtNum(sec.widthIn)}×{fmtNum(sec.thicknessIn)}
                        <span className="ml-2 text-xs font-normal text-brand-500">
                          {sec.sizeCode}
                        </span>
                      </td>
                      <td className="py-1 text-right text-sm font-medium tabular-nums text-brand-700">
                        {sec.count}
                      </td>
                      <td className="py-1 text-right text-sm font-medium tabular-nums text-brand-700">
                        {fmtNum(sec.volumeM3.toFixed(3))}
                      </td>
                      <td />
                    </tr>
                    {sec.items.map((it) => (
                      <tr key={it.id} className="border-t border-brand-100">
                        <td className="py-1 text-brand-500">{it.position}</td>
                        <td className="py-1 tabular-nums">{fmtNum(it.lengthFt)}</td>
                        <td className="py-1">{it.sizeCode}</td>
                        <td className="py-1 text-right tabular-nums">{it.count}</td>
                        <td className="py-1 text-right tabular-nums">{fmtDec3(it.volumeM3)}</td>
                        <td className="py-1 text-right">
                          {can("empotage.delete") && (
                          <button
                            onClick={() => removeItem.mutate(it.id)}
                            aria-label="Retirer la ligne"
                            className="inline-flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                          >
                            <IconX width={18} height={18} />
                          </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-200 font-semibold">
                  <td colSpan={3} className="py-1.5">
                    Total ({sections.length} section{sections.length > 1 ? "s" : ""})
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{containerPieceCount(c)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {fmtNum(containerTotalM3(c).toFixed(6))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>
          )}

          <div className="mt-3">
            {adding ? (
              <EmpotagePicker
                saving={addItems.isPending}
                onSave={(items) => addItems.mutate(items)}
              />
            ) : (
              can("empotage.create") && (
                <Button size="xs" onClick={() => setAdding(true)}>
                  <IconPlus width={16} height={16} className="-ml-0.5" />
                  Lignes d'empotage
                </Button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// L'empotage puise dans le stock général : la page Empotage ne passe pas de
// contrat. La fiche contrat en passe un pour ne montrer que ses conteneurs
// (historique — les nouveaux conteneurs n'en portent plus).
export default function ContainersSection({ contractId }: { contractId?: string }) {
  const can = useCan();
  const [showForm, setShowForm] = useState(false);

  const containers = useQuery({
    queryKey: ["containers", contractId ?? "all"],
    queryFn: () => containersApi.list(contractId),
  });
  const trucksQ = useQuery({
    queryKey: ["trucks", contractId ?? "all"],
    queryFn: () => (contractId ? trucksApi.listByContract(contractId) : trucksApi.list()),
  });
  const contractQ = useQuery({
    queryKey: ["contracts", contractId],
    queryFn: () => contractsApi.get(contractId!),
    enabled: !!contractId,
  });
  const trucks = trucksQ.data ?? [];

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          can("empotage.create") && (
            <Button size="xs" onClick={() => setShowForm((s) => !s)}>
              {showForm ? "Fermer" : <><IconPlus width={16} height={16} className="-ml-0.5" />Conteneur</>}
            </Button>
          )
        }
      >
        Conteneurs / Empotage ({containers.data?.length ?? 0})
      </SectionHeading>

      {showForm && <CreateForm trucks={trucks} onDone={() => setShowForm(false)} />}

      <div className="space-y-2">
        {containers.isLoading && <p className="text-sm text-brand-500">Chargement…</p>}
        {containers.isError && (
          <QueryError error={containers.error} onRetry={() => containers.refetch()}>
            Impossible de charger les conteneurs
          </QueryError>
        )}
        {containers.data?.length === 0 && !showForm && <EmptyState>Aucun conteneur.</EmptyState>}
        {containers.data?.map((c) => (
          <ContainerCard key={c.id} c={c} trucks={trucks} contractCode={contractQ.data?.code} />
        ))}
      </div>
    </section>
  );
}
