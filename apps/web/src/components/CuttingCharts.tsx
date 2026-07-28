import type { ContractCuttingDTO } from "@ste/shared";
import { SIZE_GROUP_LABELS, type SizeGroup } from "@ste/shared";
import { fmtNum, fmtPct } from "../lib/format";

// Palette validée (validate_palette.js : CVD ΔE 62+, labels directs requis).
const GROUP_COLOR: Record<SizeGroup, string> = {
  MAIN: "#0ea5e9",
  SIDE: "#f59e0b",
  ONE_INCH: "#8b5cf6",
  OTHER: "#94a3b8",
};

const ORDER: SizeGroup[] = ["MAIN", "SIDE", "ONE_INCH", "OTHER"];

/** Donut répartition par groupe — segments en stroke, gaps 2px via dasharray. */
function GroupDonut({ groups, total }: { groups: Record<SizeGroup, string>; total: number }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const segs = ORDER.map((g) => ({ g, v: Number(groups[g]) })).filter((s) => s.v > 0);

  let acc = 0;
  const arcs = segs.map((s) => {
    const len = (s.v / total) * C;
    const arc = { g: s.g, v: s.v, len: Math.max(len - 2, 0.5), offset: -acc };
    acc += len;
    return arc;
  });

  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" role="img" aria-label="Répartition par groupe">
      <g transform="rotate(-90 60 60)">
        {arcs.map((a) => (
          <circle
            key={a.g}
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={GROUP_COLOR[a.g]}
            strokeWidth="14"
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={a.offset}
          >
            <title>{`${SIZE_GROUP_LABELS[a.g]} : ${fmtNum(a.v.toFixed(3))} m³ (${((a.v / total) * 100).toFixed(0)} %)`}</title>
          </circle>
        ))}
      </g>
      <text x="60" y="57" textAnchor="middle" className="fill-slate-900" fontSize="13" fontWeight="600">
        {fmtNum(total.toFixed(1))}
      </text>
      <text x="60" y="71" textAnchor="middle" className="fill-slate-400" fontSize="8">
        m³ débités
      </text>
    </svg>
  );
}

/** Barres horizontales par taille (9 tailles lisibles — mieux qu'un camembert à 9 parts). */
function SizeBars({ sizes }: { sizes: ContractCuttingDTO["sizes"] }) {
  const max = Math.max(...sizes.map((s) => Number(s.volumeM3)), 0);
  if (max <= 0) return null;
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      {sizes.map((s) => {
        const v = Number(s.volumeM3);
        return (
          <div key={s.code} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2">
            <span className="text-xs font-medium text-slate-700">{s.code}</span>
            <div className="h-3.5 overflow-hidden rounded-r-sm bg-slate-100">
              <div
                className="h-full rounded-r-sm"
                style={{ width: `${(v / max) * 100}%`, backgroundColor: GROUP_COLOR[s.group] }}
              >
                <title>{`${s.code} : ${fmtNum(v.toFixed(3))} m³`}</title>
              </div>
            </div>
            <span className="text-right text-xs tabular-nums text-slate-600">
              {fmtNum(v.toFixed(2))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CuttingCharts({ data }: { data: ContractCuttingDTO }) {
  const total = Number(data.totalM3);
  if (total <= 0) return null;

  return (
    <div className="mb-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <GroupDonut groups={data.groups} total={total} />
        <SizeBars sizes={data.sizes} />
      </div>
      {/* Légende (identité par pastille, valeurs en encre) */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {ORDER.filter((g) => Number(data.groups[g]) > 0).map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: GROUP_COLOR[g] }}
            />
            {SIZE_GROUP_LABELS[g]} · {fmtNum(Number(data.groups[g]).toFixed(3))} m³ (
            {fmtPct((Number(data.groups[g]) / total) * 100, 0)})
          </span>
        ))}
      </div>
    </div>
  );
}
