import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PackingLogDTO, TruckDTO } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";
import Button from "./ui/Button";
import { EmptyState, FormError } from "./ui/Feedback";

// Packing list grumes = « Spécification de transport » SODEFOR (1 ligne/bille).
// Détail optionnel ; le total de référence reste le brousse déclaré du camion.

type RowState = {
  billNo: string;
  diaTop: string;
  diaBottom: string;
  diaMean: string;
  length: string;
  volume: string;
};

const emptyRow = (): RowState => ({
  billNo: "",
  diaTop: "",
  diaBottom: "",
  diaMean: "",
  length: "",
  volume: "",
});

function rowFromDTO(l: PackingLogDTO): RowState {
  return {
    billNo: l.billNo ?? "",
    diaTop: l.diaTopCm ?? "",
    diaBottom: l.diaBottomCm ?? "",
    diaMean: l.diaMeanCm ?? "",
    length: l.lengthM ?? "",
    volume: l.volumeM3 ?? "",
  };
}

// Téléphone (< sm) : carte 2 rangées — n° + Ø gros/petit, puis Ø moy + L·m³ + ×.
// Même ordre DOM, l'Entrée-chaînage sur m³ ne change pas.
const COLS =
  "grid grid-cols-[1.5rem_1fr_1fr_1fr_2.75rem] sm:grid-cols-[1.5rem_1fr_1fr_1fr_1fr_1fr_2.75rem] items-center gap-1";

/** Mini-libellé au-dessus d'un champ, visible seulement sous sm. */
function ColLabel({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="mb-0.5 block text-xs text-brand-500 sm:hidden">
      {children}
    </span>
  );
}

function PackingEntry({
  truckId,
  initial,
  declaredFieldM3,
  onDone,
}: {
  truckId: string;
  initial: PackingLogDTO[];
  declaredFieldM3: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<RowState[]>(
    initial.length ? initial.map(rowFromDTO) : [emptyRow()]
  );
  const [error, setError] = useState<string | null>(null);

  const valid = rows.filter((r) => r.volume.trim() && Number(r.volume) > 0);
  const total = valid.reduce((s, r) => s + Number(r.volume), 0);
  const declared = declaredFieldM3 ? Number(declaredFieldM3) : null;
  const gap = declared !== null ? total - declared : null;

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  const addRow = () => setRows((p) => [...p, emptyRow()]);
  const removeRow = (i: number) =>
    setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

  const save = useMutation({
    mutationFn: () =>
      trucksApi.setPacking(truckId, {
        logs: valid.map((r) => ({
          ...(r.billNo.trim() ? { billNo: r.billNo.trim() } : {}),
          ...(r.diaTop.trim() ? { diaTopCm: r.diaTop.trim() } : {}),
          ...(r.diaBottom.trim() ? { diaBottomCm: r.diaBottom.trim() } : {}),
          ...(r.diaMean.trim() ? { diaMeanCm: r.diaMean.trim() } : {}),
          ...(r.length.trim() ? { lengthM: r.length.trim() } : {}),
          volumeM3: r.volume.trim(),
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trucks"] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      {/* min-w 620 : défilement horizontal jusqu'à md, en-tête collant au-delà. */}
      <div className="overflow-x-auto md:overflow-visible">
      <div className="sm:min-w-[620px]">
      <div className="hidden items-center gap-1 text-xs text-brand-500 sm:grid sm:grid-cols-[1.5rem_1fr_1fr_1fr_1fr_1fr_2.75rem] md:sticky md:top-header md:z-10 md:rounded-lg md:bg-white md:py-1">
        <span>#</span>
        <span>N° bille</span>
        <span>Ø gros</span>
        <span>Ø petit</span>
        <span>Ø moy</span>
        <span>L (m) · m³</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className={`mt-1 ${COLS} border-b border-brand-100 pb-2 sm:border-b-0 sm:pb-0`}
        >
          <span className="text-xs text-brand-400">{i + 1}</span>
          <div className="min-w-0">
            <ColLabel>N° bille</ColLabel>
            <input
              value={r.billNo}
              onChange={(e) => setRow(i, { billNo: e.target.value })}
              placeholder="1509"
              aria-label={`N° bille ligne ${i + 1}`}
              className="w-full min-w-0 min-h-touch rounded-lg border border-brand-200 px-2 py-2 text-base outline-none focus:border-brand-900"
            />
          </div>
          <div className="min-w-0">
            <ColLabel>Ø gros</ColLabel>
            <input
              inputMode="decimal"
              value={r.diaTop}
              onChange={(e) => setRow(i, { diaTop: e.target.value })}
              placeholder="34"
              aria-label={`Ø gros ligne ${i + 1}`}
              className="w-full min-w-0 min-h-touch rounded-lg border border-brand-200 px-2 py-2 text-base outline-none focus:border-brand-900"
            />
          </div>
          <div className="min-w-0">
            <ColLabel>Ø petit</ColLabel>
            <input
              inputMode="decimal"
              value={r.diaBottom}
              onChange={(e) => setRow(i, { diaBottom: e.target.value })}
              placeholder="16"
              aria-label={`Ø petit ligne ${i + 1}`}
              className="w-full min-w-0 min-h-touch rounded-lg border border-brand-200 px-2 py-2 text-base outline-none focus:border-brand-900"
            />
          </div>
          <div className="col-start-2 min-w-0 sm:col-auto">
            <ColLabel>Ø moy</ColLabel>
            <input
              inputMode="decimal"
              value={r.diaMean}
              onChange={(e) => setRow(i, { diaMean: e.target.value })}
              placeholder="25"
              aria-label={`Ø moy ligne ${i + 1}`}
              className="w-full min-w-0 min-h-touch rounded-lg border border-brand-200 px-2 py-2 text-base outline-none focus:border-brand-900"
            />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-1 sm:col-span-1">
            <div className="min-w-0">
              <ColLabel>L (m)</ColLabel>
              <input
                inputMode="decimal"
                value={r.length}
                onChange={(e) => setRow(i, { length: e.target.value })}
                placeholder="11.2"
                aria-label={`L (m) ligne ${i + 1}`}
                className="w-full min-w-0 min-h-touch rounded-lg border border-brand-200 px-2 py-2 text-base outline-none focus:border-brand-900"
              />
            </div>
            <div className="min-w-0">
              <ColLabel>m³</ColLabel>
              <input
                inputMode="decimal"
                value={r.volume}
                onChange={(e) => setRow(i, { volume: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && i === rows.length - 1) {
                    e.preventDefault();
                    addRow();
                  }
                }}
                placeholder="0.55"
                aria-label={`m³ ligne ${i + 1}`}
                className="w-full min-w-0 min-h-touch rounded-lg border border-brand-300 px-2 py-2 text-base outline-none focus:border-brand-900"
              />
            </div>
          </div>
          {/* Vraie cible tactile — la croix jouxte le champ m³ au pouce. */}
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="flex min-h-touch w-full items-center justify-center self-end rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100 sm:self-center"
            aria-label="Supprimer la ligne"
          >
            ×
          </button>
        </div>
      ))}
      </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button size="xs" onClick={addRow}>
          + Ligne
        </Button>
        <div className="text-sm">
          <span className="text-brand-500">Total ({valid.length} billes) : </span>
          <span className="font-semibold text-brand-900">{fmtM3(total.toFixed(6))}</span>
          {gap !== null && Math.abs(gap) >= 0.001 && (
            <span className={`ml-2 text-xs ${Math.abs(gap) > 0.5 ? "text-amber-600" : "text-brand-500"}`}>
              écart brousse déclaré {gap > 0 ? "+" : ""}
              {fmtNum(gap.toFixed(3))}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {error && <FormError>{error}</FormError>}
        <div className="ml-auto flex gap-2">
          <Button onClick={onDone}>Annuler</Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={save.isPending || valid.length === 0}
          >
            {save.isPending ? "Enregistrement…" : `Valider (${valid.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PackingList({ truck }: { truck: TruckDTO }) {
  const [editing, setEditing] = useState(false);
  const rows = truck.packingLogs;
  const total = rows.reduce((s, l) => s + Number(l.volumeM3), 0);
  const declared = truck.declaredFieldM3 ? Number(truck.declaredFieldM3) : null;
  const gap = declared !== null && rows.length ? total - declared : null;

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-400">
          Packing list grumes ({rows.length})
        </h2>
        {!editing && (
          <Button size="xs" onClick={() => setEditing(true)}>
            {rows.length ? "Modifier" : "+ Saisir"}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-brand-200 bg-white p-4">
        {editing ? (
          <PackingEntry
            truckId={truck.id}
            initial={rows}
            declaredFieldM3={truck.declaredFieldM3}
            onDone={() => setEditing(false)}
          />
        ) : rows.length === 0 ? (
          <EmptyState>
            Détail bille par bille du bordereau (optionnel). Le total de référence est le
            cubage brousse déclaré du camion.
          </EmptyState>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4 scroll-shadow-x">
            <table className="w-full min-w-[560px] text-base">
              <thead>
                <tr className="text-left text-xs text-brand-500">
                  <th className="py-1 font-normal">#</th>
                  <th className="py-1 font-normal">N° bille</th>
                  <th className="py-1 text-right font-normal">Ø gros</th>
                  <th className="py-1 text-right font-normal">Ø petit</th>
                  <th className="py-1 text-right font-normal">Ø moy</th>
                  <th className="py-1 text-right font-normal">L (m)</th>
                  <th className="py-1 text-right font-normal">m³</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-t border-brand-100">
                    <td className="py-1 text-brand-400">{l.position}</td>
                    <td className="py-1">{l.billNo ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{l.diaTopCm ? fmtNum(l.diaTopCm) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{l.diaBottomCm ? fmtNum(l.diaBottomCm) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{l.diaMeanCm ? fmtNum(l.diaMeanCm) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{l.lengthM ? fmtNum(l.lengthM) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{fmtNum(l.volumeM3)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-200 font-semibold">
                  <td colSpan={6} className="py-1.5">
                    Total ({rows.length} billes)
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmtNum(total.toFixed(6))}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            {gap !== null && Math.abs(gap) >= 0.001 && (
              <p
                className={`mt-2 text-sm ${
                  Math.abs(gap) > 0.5 ? "text-amber-600" : "text-brand-500"
                }`}
              >
                Écart avec le brousse déclaré ({fmtM3(truck.declaredFieldM3!)}) :{" "}
                {gap > 0 ? "+" : ""}
                {fmtNum(gap.toFixed(3))} m³
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
