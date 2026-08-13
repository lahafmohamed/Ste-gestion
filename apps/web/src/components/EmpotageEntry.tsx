import { useState } from "react";
import { classifySize, sawnVolumeM3 } from "@ste/shared";
import { fmtNum, normalizeDecimal } from "../lib/format";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import Button from "./ui/Button";
import { inputQuietCls } from "./ui/Input";

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
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2.75rem] items-center gap-1 text-xs text-slate-500">
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
            className="mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2.75rem] items-center gap-1"
          >
            <span className="text-xs text-slate-400">{i + 1}</span>
            {(["lengthFt", "widthIn", "thicknessIn", "count"] as const).map((k) => (
              <input
                key={k}
                inputMode="decimal"
                value={r[k]}
                // Clavier FR : « 6,5 » doit partir en « 6.5 », sinon l'API rejette la ligne.
                onChange={(e) => setRow(i, { [k]: normalizeDecimal(e.target.value) })}
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
                className={inputQuietCls}
              />
            ))}
            {info ? (
              <Badge tone={SIZE_GROUP_TONE[info.size.group]} className="justify-self-center">
                {info.size.code}
              </Badge>
            ) : (
              <span className="text-center text-xs text-slate-300">—</span>
            )}
            <span className="text-right text-sm tabular-nums text-slate-700">
              {info ? info.volume.toFixed(3) : "—"}
            </span>
            <button
              type="button"
              onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
              className="flex h-11 w-full items-center justify-center rounded-lg text-lg text-slate-300 hover:bg-red-50 hover:text-red-500"
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
        <Button variant="secondary" size="xs" onClick={() => setRows((p) => [...p, emptyRow()])}>
          + Ligne
        </Button>
        <div className="text-sm">
          <span className="text-slate-500">{fmtNum(pieces)} pièces · </span>
          <span className="font-semibold text-slate-900">{fmtNum(total.toFixed(6))} m³</span>
        </div>
      </div>

      <Button
        variant="primary"
        size="lg"
        onClick={save}
        disabled={saving || valid.length === 0}
        className="mt-3 w-full"
      >
        {saving ? "Enregistrement…" : `Ajouter ${valid.length} ligne(s)`}
      </Button>
    </div>
  );
}
