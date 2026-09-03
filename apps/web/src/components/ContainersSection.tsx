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
import { containersApi, contractsApi, trucksApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";
import { printContainerPackingList } from "../lib/printPacking";
import EmpotagePicker from "./EmpotagePicker";
import Badge, { type BadgeTone } from "./ui/Badge";
import Button from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import Chip from "./ui/Chip";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field } from "./ui/Input";

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

function CreateForm({
  contractId,
  trucks,
  onDone,
}: {
  contractId: string;
  trucks: TruckDTO[];
  onDone: () => void;
}) {
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
      qc.invalidateQueries({ queryKey: ["containers", contractId] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          contractId,
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
  contractId,
  trucks,
  contractCode,
}: {
  c: ContainerDTO;
  contractId: string;
  trucks: TruckDTO[];
  contractCode?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editTrucks, setEditTrucks] = useState(false);
  // Confirmation lisible sur tablette (remplace window.confirm).
  const [delOpen, setDelOpen] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["containers", contractId] });
    // Le panier lit le stock restant : il doit refléter ce qui vient d'être empoté.
    qc.invalidateQueries({ queryKey: ["sawn-inventory", contractId] });
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-touch w-full items-center justify-between gap-2 p-3 text-left hover:bg-brand-50 active:bg-brand-100"
      >
        <div>
          <div className="font-medium text-brand-900">{c.containerNo}</div>
          <div className="text-sm text-brand-500">
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
        <div className="flex items-center gap-2 text-right">
          <div>
            <div className="text-sm font-semibold text-brand-900">
              {fmtM3(containerTotalM3(c))}
            </div>
            {/* Contenu visible sans déplier : pièces + sections l×ép. */}
            {c.items.length > 0 && (
              <div className="text-xs text-brand-500">
                {fmtNum(containerPieceCount(c))} pièces · {sections.length} section
                {sections.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
          <Badge tone={STATUS_TONE[c.status]}>{CONTAINER_STATUS_LABELS[c.status]}</Badge>
        </div>
      </button>

      {open && (
        <div className="border-t border-brand-100 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-brand-500">Statut :</span>
            {STATUSES.map((st) => (
              <Chip key={st} selected={c.status === st} onClick={() => setStatus.mutate(st)}>
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
            <button
              onClick={() => setDelOpen(true)}
              className="ml-auto min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
            >
              Supprimer conteneur
            </button>
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
                  className="min-h-touch self-start rounded-lg px-2 text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                {linkedRegs.length ? (
                  linkedRegs.map((r) => <Badge key={r}>{r}</Badge>)
                ) : (
                  <span className="text-brand-400">aucun</span>
                )}
                {trucks.length > 0 && (
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
                        <td className="py-1 text-brand-400">{it.position}</td>
                        <td className="py-1 tabular-nums">{fmtNum(it.lengthFt)}</td>
                        <td className="py-1">{it.sizeCode}</td>
                        <td className="py-1 text-right tabular-nums">{it.count}</td>
                        <td className="py-1 text-right tabular-nums">{fmtNum(it.volumeM3)}</td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => removeItem.mutate(it.id)}
                            aria-label="Retirer la ligne"
                            className="inline-flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                          >
                            ×
                          </button>
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
                contractId={contractId}
                saving={addItems.isPending}
                onSave={(items) => addItems.mutate(items)}
              />
            ) : (
              <Button size="xs" onClick={() => setAdding(true)}>
                + Lignes d'empotage
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContainersSection({ contractId }: { contractId: string }) {
  const [showForm, setShowForm] = useState(false);

  const containers = useQuery({
    queryKey: ["containers", contractId],
    queryFn: () => containersApi.listByContract(contractId),
  });
  const trucksQ = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId),
  });
  const contractQ = useQuery({
    queryKey: ["contracts", contractId],
    queryFn: () => contractsApi.get(contractId),
  });
  const trucks = trucksQ.data ?? [];

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          <Button size="xs" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Conteneur"}
          </Button>
        }
      >
        Conteneurs / Empotage ({containers.data?.length ?? 0})
      </SectionHeading>

      {showForm && (
        <CreateForm contractId={contractId} trucks={trucks} onDone={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {containers.isLoading && <p className="text-sm text-brand-500">Chargement…</p>}
        {containers.isError && (
          <QueryError error={containers.error} onRetry={() => containers.refetch()}>
            Impossible de charger les conteneurs
          </QueryError>
        )}
        {containers.data?.length === 0 && !showForm && <EmptyState>Aucun conteneur.</EmptyState>}
        {containers.data?.map((c) => (
          <ContainerCard
            key={c.id}
            c={c}
            contractId={contractId}
            trucks={trucks}
            contractCode={contractQ.data?.code}
          />
        ))}
      </div>
    </section>
  );
}
