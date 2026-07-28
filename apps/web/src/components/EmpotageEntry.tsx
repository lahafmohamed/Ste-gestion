import { useState } from "react";
import { classifySize, sawnVolumeM3, type SizeGroup } from "@ste/shared";
import { fmtNum } from "../lib/format";

type RowState = { lengthFt: string; widthIn: string; thicknessIn: string; count: string };
const emptyRow = (): RowState => ({ lengthFt: "", widthIn: "", thicknessIn: "", count: "" });

function rowInfo(r: RowState) {
  const L = Number(r.lengthFt);
  const w = Number(r.widthIn);
  const t = Number(r.thicknessIn);
  const n = Number(r.count);
  if (!r.lengthFt || !r.widthIn || !r.thicknessIn || !r.count) return null;
  if (!(L > 0) || !(w > 0) || !(t > 0) || !Number.isInteger(n) || n < 1) return null;
  return { volume: sawnVolumeM3(L, w, t, n), size: classifySize(w, t), count: n };
}

const GROUP_BADGE: Record<SizeGroup, string> = {
  MAIN: "bg-sky-50 text-sky-700",
  SIDE: "bg-amber-50 text-amber-700",
  ONE_INCH: "bg-violet-50 text-violet-700",
  OTHER: "bg-slate-100 text-slate-500",
};

type Item = { lengthFt: string; widthIn: string; thicknessIn: string; count: number };

export default function EmpotageEntry({
  onSave,
  saving,
}: {
  onSave: (items: Item[]) => void;
  saving: boolean;
}) {
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const infos = rows.map(rowInfo);
  const valid = infos.filter((x) => x !== null);
  const total = valid.reduce((s, x) => s + x!.volume, 0);
  const pieces = valid.reduce((s, x) => s + x!.count, 0);

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    const items = rows
      .filter((_, i) => infos[i] !== null)
      .map((r) => ({
        lengthFt: r.lengthFt.trim(),
        widthIn: r.widthIn.trim(),
        thicknessIn: r.thicknessIn.trim(),
        count: Number(r.count),
      }));
    if (items.length > 0) onSave(items);
  }

  return (
    <div>
      <div className="overflow-x-auto">
      <div className="min-w-[620px]">
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2rem] items-center gap-1 text-xs text-slate-500">
        <span>#</span>
        <span>L (ft)</span>
        <span>l (in)</span>
        <span>ép (in)</span>
        <span>Nbr</span>
        <span>Taille</span>
        <span className="text-right">m³</span>
        <span />
      </div>

      {rows.map((r, i) => {
        const info = infos[i];
        return (
          <div
            key={i}
            className="mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2rem] items-center gap-1"
          >
            <span className="text-xs text-slate-400">{i + 1}</span>
            {(["lengthFt", "widthIn", "thicknessIn", "count"] as const).map((k) => (
              <input
                key={k}
                inputMode="decimal"
                value={r[k]}
                onChange={(e) => setRow(i, { [k]: e.target.value })}
                onKeyDown={
                  k === "count"
                    ? (e) => {
                        if (e.key === "Enter" && i === rows.length - 1) {
                          e.preventDefault();
                          setRows((p) => [...p, emptyRow()]);
                        }
                      }
                    : undefined
                }
                className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
              />
            ))}
            <span
              className={`rounded-full px-1.5 py-0.5 text-center text-xs ${
                info ? GROUP_BADGE[info.size.group] : "text-slate-300"
              }`}
            >
              {info ? info.size.code : "—"}
            </span>
            <span className="text-right text-sm tabular-nums text-slate-700">
              {info ? info.volume.toFixed(3) : "—"}
            </span>
            <button
              type="button"
              onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
              className="text-slate-300 hover:text-red-500"
              aria-label="Supprimer la ligne"
            >
              ×
            </button>
          </div>
        );
      })}
      </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRows((p) => [...p, emptyRow()])}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-900"
        >
          + Ligne
        </button>
        <div className="text-sm">
          <span className="text-slate-500">{fmtNum(pieces)} pièces · </span>
          <span className="font-semibold text-slate-900">{fmtNum(total.toFixed(6))} m³</span>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || valid.length === 0}
        className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {saving ? "Enregistrement…" : `Ajouter ${valid.length} ligne(s)`}
      </button>
    </div>
  );
}
