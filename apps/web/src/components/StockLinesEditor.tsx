import {
  classifySize,
  QUALITY_LABELS,
  sawnVolumeM3,
  suiviColumnKey,
  suiviColumnLabel,
  type Quality,
  type StockLineInput,
} from "@ste/shared";
import { fmtDec3, normalizeDecimal } from "../lib/format";
import Badge from "./ui/Badge";
import { inputQuietCls } from "./ui/Input";
import { IconPlus, IconX } from "./icons";

// Saisie de pièces d'avivés : L (ft) × l (in) × ép (in) × Nbr + qualité, comme
// le tableau STOCK du client. Sert au resciage, aux sorties et à l'inventaire.
// La qualité d'une nouvelle ligne reprend celle de la ligne du dessus : le
// classeur range les pièces par blocs (A GRADE, puis B…).

export type LineRow = {
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  count: string;
  quality: Quality;
};

export const emptyLine = (quality: Quality = "B"): LineRow => ({
  lengthFt: "",
  widthIn: "",
  thicknessIn: "",
  count: "",
  quality,
});

const COL_LABELS = {
  lengthFt: "L (ft)",
  widthIn: "l (in)",
  thicknessIn: "ép (in)",
  count: "Nbr",
} as const;

export function lineInfo(r: LineRow) {
  const L = Number(r.lengthFt);
  const w = Number(r.widthIn);
  const t = Number(r.thicknessIn);
  const n = Number(r.count);
  if (!r.lengthFt || !r.widthIn || !r.thicknessIn || !r.count) return null;
  if (!(L > 0) || !(w > 0) || !(t > 0) || !Number.isInteger(n) || n < 1) return null;
  return {
    volume: sawnVolumeM3(L, w, t, n),
    size: classifySize(w, t),
    suiviKey: suiviColumnKey(w, t, r.quality),
    count: n,
    key: `${L}x${w}x${t}:${r.quality}`,
  };
}

export function toLineInputs(rows: LineRow[]): StockLineInput[] {
  return rows
    .filter((r) => lineInfo(r) !== null)
    .map((r) => ({
      lengthFt: r.lengthFt.trim(),
      widthIn: r.widthIn.trim(),
      thicknessIn: r.thicknessIn.trim(),
      count: Number(r.count),
      quality: r.quality,
    }));
}

const QUALITIES: Quality[] = ["B", "A", "C"];

// Grille : # · L · l · ép · Nbr · Qualité · Produit · m³ · ✕. Téléphone : carte
// à deux rangées (Nbr, qualité, m³ en dessous), ordre DOM inchangé — Entrée
// sur « Nbr » de la dernière ligne en ajoute une, comme au débitage.
const GRID_SM = "sm:grid-cols-[2rem_1fr_1fr_1fr_1fr_5rem_5.5rem_5rem_2.75rem]";

export default function StockLinesEditor({
  rows,
  setRows,
}: {
  rows: LineRow[];
  setRows: React.Dispatch<React.SetStateAction<LineRow[]>>;
}) {
  const infos = rows.map(lineInfo);
  function setRow(i: number, patch: Partial<LineRow>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  const addRow = () => setRows((p) => [...p, emptyLine(p[p.length - 1]?.quality ?? "B")]);

  return (
    <div>
      <div className="overflow-x-auto sm:overflow-visible">
        <div className="sm:min-w-[640px]">
          <div
            className={`hidden items-center gap-1 text-xs text-brand-500 sm:grid ${GRID_SM}`}
          >
            <span>#</span>
            <span>L (ft)</span>
            <span>l (in)</span>
            <span>ép (in)</span>
            <span>Nbr</span>
            <span>Qualité</span>
            <span>Produit</span>
            <span className="text-right">m³</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const info = infos[i];
            return (
              <div
                key={i}
                className={`mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_2.75rem] items-center gap-1 border-b border-brand-100 pb-2 sm:border-b-0 sm:pb-0 ${GRID_SM}`}
              >
                <span className="text-xs tabular-nums text-brand-500">{i + 1}</span>
                {(["lengthFt", "widthIn", "thicknessIn", "count"] as const).map((k) => (
                  <div
                    key={k}
                    className={`min-w-0${k === "count" ? " col-start-2 sm:col-auto" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className="mb-0.5 block text-xs text-brand-500 sm:hidden"
                    >
                      {COL_LABELS[k]}
                    </span>
                    <input
                      inputMode={k === "count" ? "numeric" : "decimal"}
                      value={r[k]}
                      aria-label={`${COL_LABELS[k]} ligne ${i + 1}`}
                      // Clavier FR : « 6,5 » doit partir en « 6.5 ».
                      onChange={(e) => setRow(i, { [k]: normalizeDecimal(e.target.value) })}
                      onKeyDown={
                        k === "count"
                          ? (e) => {
                              if (e.key === "Enter" && i === rows.length - 1) {
                                e.preventDefault();
                                addRow();
                              }
                            }
                          : undefined
                      }
                      className={inputQuietCls}
                    />
                  </div>
                ))}
                <div className="min-w-0">
                  <span aria-hidden="true" className="mb-0.5 block text-xs text-brand-500 sm:hidden">
                    Qualité
                  </span>
                  <select
                    value={r.quality}
                    aria-label={`Qualité ligne ${i + 1}`}
                    onChange={(e) => setRow(i, { quality: e.target.value as Quality })}
                    className={`${inputQuietCls} text-base`}
                  >
                    {QUALITIES.map((q) => (
                      <option key={q} value={q}>
                        {QUALITY_LABELS[q]}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Produit (colonne du suivi) : redit sur téléphone par le m³. */}
                <span className="hidden justify-self-start sm:inline-flex">
                  {info ? (
                    <Badge tone="brand">{suiviColumnLabel(info.suiviKey)}</Badge>
                  ) : (
                    <span aria-hidden className="text-xs text-brand-500">
                      —
                    </span>
                  )}
                </span>
                <span className="self-end text-right text-base tabular-nums text-brand-700 sm:self-auto">
                  <span className="mr-1 text-xs text-brand-500 sm:hidden">m³</span>
                  {info ? fmtDec3(info.volume) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                  className="flex min-h-touch w-full items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 active:bg-red-100"
                  aria-label={`Supprimer la ligne ${i + 1}`}
                >
                  <IconX width={18} height={18} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-300 py-2 text-sm font-medium text-brand-600 transition-colors hover:border-brand-900 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100"
      >
        <IconPlus width={16} height={16} className="-ml-0.5" />
        Ajouter une ligne
      </button>
    </div>
  );
}
