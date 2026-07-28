import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PackingLogDTO, TruckDTO } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";

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

const COLS = "grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr_1fr_1.5rem] items-center gap-1";

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
      <div className="overflow-x-auto">
      <div className="min-w-[620px]">
      <div className={`${COLS} text-xs text-slate-500`}>
        <span>#</span>
        <span>N° bille</span>
        <span>Ø gros</span>
        <span>Ø petit</span>
        <span>Ø moy</span>
        <span>L (m) · m³</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`mt-1 ${COLS}`}>
          <span className="text-xs text-slate-400">{i + 1}</span>
          <input
            value={r.billNo}
            onChange={(e) => setRow(i, { billNo: e.target.value })}
            placeholder="1509"
            className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
          />
          <input
            inputMode="decimal"
            value={r.diaTop}
            onChange={(e) => setRow(i, { diaTop: e.target.value })}
            placeholder="34"
            className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
          />
          <input
            inputMode="decimal"
            value={r.diaBottom}
            onChange={(e) => setRow(i, { diaBottom: e.target.value })}
            placeholder="16"
            className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
          />
          <input
            inputMode="decimal"
            value={r.diaMean}
            onChange={(e) => setRow(i, { diaMean: e.target.value })}
            placeholder="25"
            className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              inputMode="decimal"
              value={r.length}
              onChange={(e) => setRow(i, { length: e.target.value })}
              placeholder="11.2"
              className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
            />
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
              className="w-full min-w-0 rounded border border-slate-300 px-2 py-2.5 text-base outline-none focus:border-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-slate-300 hover:text-red-500"
            aria-label="Supprimer la ligne"
          >
            ×
          </button>
        </div>
      ))}
      </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-900"
        >
          + Ligne
        </button>
        <div className="text-sm">
          <span className="text-slate-500">Total ({valid.length} billes) : </span>
          <span className="font-semibold text-slate-900">{fmtM3(total.toFixed(6))}</span>
          {gap !== null && Math.abs(gap) >= 0.001 && (
            <span className={`ml-2 text-xs ${Math.abs(gap) > 0.5 ? "text-amber-600" : "text-slate-500"}`}>
              écart brousse déclaré {gap > 0 ? "+" : ""}
              {fmtNum(gap.toFixed(3))}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {error && <span className="text-sm text-red-600">{error}</span>}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || valid.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {save.isPending ? "Enregistrement…" : `Valider (${valid.length})`}
          </button>
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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Packing list grumes ({rows.length})
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-900"
          >
            {rows.length ? "Modifier" : "+ Saisir"}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {editing ? (
          <PackingEntry
            truckId={truck.id}
            initial={rows}
            declaredFieldM3={truck.declaredFieldM3}
            onDone={() => setEditing(false)}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            Détail bille par bille du bordereau (optionnel). Le total de référence est le
            cubage brousse déclaré du camion.
          </p>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
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
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-1 text-slate-400">{l.position}</td>
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
                <tr className="border-t border-slate-200 font-semibold">
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
                className={`mt-2 text-xs ${
                  Math.abs(gap) > 0.5 ? "text-amber-600" : "text-slate-500"
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
