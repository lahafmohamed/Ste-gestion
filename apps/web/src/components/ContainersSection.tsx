import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONTAINER_STATUS_LABELS,
  containerPieceCount,
  containerTotalM3,
  type ContainerDTO,
  type ContainerStatus,
  type TruckDTO,
} from "@ste/shared";
import { containersApi, contractsApi, trucksApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";
import { printContainerPackingList } from "../lib/printPacking";
import EmpotageEntry from "./EmpotageEntry";

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
        <button
          key={t.id}
          type="button"
          onClick={() => onToggle(t.id)}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            selected.includes(t.id)
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 text-slate-600"
          }`}
        >
          {t.registration}
        </button>
      ))}
    </div>
  );
}

const STATUS_BADGE: Record<ContainerStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-500",
  LOADING: "bg-amber-50 text-amber-700",
  LOADED: "bg-sky-50 text-sky-700",
  SHIPPED: "bg-emerald-50 text-emerald-700",
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
      className="mb-3 rounded-xl border border-slate-200 bg-white p-4"
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
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">{label}</span>
            <input
              required={required}
              value={v[key]}
              onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))}
              placeholder={ph}
              className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
            />
          </label>
        ))}
      </div>
      {trucks.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-slate-500">Camions d'origine (optionnel)</div>
          <TruckChips
            trucks={trucks}
            selected={truckIds}
            onToggle={(id) =>
              setTruckIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
            }
          />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        {error && <span className="text-sm text-red-600">{error}</span>}
        <button
          type="submit"
          disabled={create.isPending}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Créer le conteneur
        </button>
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

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["containers", contractId] });
  }

  const linkedRegs = trucks.filter((t) => c.truckIds.includes(t.id)).map((t) => t.registration);

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
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <div>
          <div className="font-medium text-slate-900">{c.containerNo}</div>
          <div className="text-xs text-slate-500">
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
          <span className="text-sm font-semibold text-slate-900">
            {fmtM3(containerTotalM3(c))}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[c.status]}`}>
            {CONTAINER_STATUS_LABELS[c.status]}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Statut :</span>
            {STATUSES.map((st) => (
              <button
                key={st}
                onClick={() => setStatus.mutate(st)}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  c.status === st
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-500"
                }`}
              >
                {CONTAINER_STATUS_LABELS[st]}
              </button>
            ))}
            <button
              onClick={() =>
                printContainerPackingList(c, {
                  contractCode,
                  truckRegistrations: linkedRegs,
                })
              }
              disabled={c.items.length === 0}
              className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-900 disabled:opacity-40"
            >
              Imprimer packing list
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Supprimer le conteneur ${c.containerNo} (${c.items.length} ligne${c.items.length > 1 ? "s" : ""} d'empotage) ? Action irréversible.`
                  )
                )
                  remove.mutate();
              }}
              className="ml-auto text-xs text-slate-400 hover:text-red-600"
            >
              Supprimer conteneur
            </button>
          </div>

          {/* Camions d'origine (traçabilité) */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Camions d'origine :</span>
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
                  className="self-start text-slate-400 hover:text-slate-700"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                {linkedRegs.length ? (
                  linkedRegs.map((r) => (
                    <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">aucun</span>
                )}
                {trucks.length > 0 && (
                  <button
                    onClick={() => setEditTrucks(true)}
                    className="text-slate-500 hover:text-slate-900"
                  >
                    Modifier
                  </button>
                )}
              </>
            )}
          </div>

          {c.items.length > 0 && (
            <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-normal">#</th>
                  <th className="py-1 font-normal">L×l×ép</th>
                  <th className="py-1 font-normal">Taille</th>
                  <th className="py-1 text-right font-normal">Nbr</th>
                  <th className="py-1 text-right font-normal">m³</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="py-1 text-slate-400">{it.position}</td>
                    <td className="py-1 tabular-nums">
                      {fmtNum(it.lengthFt)}×{fmtNum(it.widthIn)}×{fmtNum(it.thicknessIn)}
                    </td>
                    <td className="py-1">{it.sizeCode}</td>
                    <td className="py-1 text-right tabular-nums">{it.count}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNum(it.volumeM3)}</td>
                    <td className="py-1 text-right">
                      <button
                        onClick={() => removeItem.mutate(it.id)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td colSpan={3} className="py-1.5">
                    Total ({containerPieceCount(c)} pièces)
                  </td>
                  <td />
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
              <EmpotageEntry saving={addItems.isPending} onSave={(items) => addItems.mutate(items)} />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-900"
              >
                + Lignes d'empotage
              </button>
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
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Conteneurs / Empotage ({containers.data?.length ?? 0})
        </h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-900"
        >
          {showForm ? "Fermer" : "+ Conteneur"}
        </button>
      </div>

      {showForm && (
        <CreateForm contractId={contractId} trucks={trucks} onDone={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {containers.data?.length === 0 && !showForm && (
          <p className="text-sm text-slate-500">Aucun conteneur.</p>
        )}
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
