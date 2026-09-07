import { cuttingResume } from "@ste/shared";
import { fmtPct } from "../lib/format";

// Trois décimales fixes : « 0,040 » sous « 3,339 », les colonnes s'alignent.
const m3 = (v: number) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// « CUTTING RESUME TRUCK » du classeur de pilotage : m³ et part par famille de
// sciage, total, puis split long / court. Même lecture que l'Excel pour que le
// bureau retrouve ses repères sans recalculer.

type Line = {
  lengthFt: number | string;
  widthIn: number | string;
  thicknessIn: number | string;
  volumeM3: number | string;
  grade?: string | null;
};

export default function CuttingResume({
  lines,
  className = "",
}: {
  lines: Line[];
  className?: string;
}) {
  const r = cuttingResume(lines);
  if (r.totalM3 <= 0) return null;
  const rows = r.rows.filter((x) => x.m3 > 0 || x.key !== "other");
  return (
    <div className={`rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-100 ${className}`}>
      <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-500">
        Cutting résumé
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((x) => (
            <tr key={x.key} className={x.m3 > 0 ? "text-brand-800" : "text-brand-400"}>
              <td className="px-3 py-1">{x.label}</td>
              <td className="px-3 py-1 text-right tabular-nums">{m3(x.m3)}</td>
              <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums">{fmtPct(x.pct, 1)}</td>
            </tr>
          ))}
          <tr className="border-t border-brand-200 font-semibold text-brand-900">
            <td className="px-3 py-1.5">Total</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{m3(r.totalM3)}</td>
            <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">100 %</td>
          </tr>
          <tr className="border-t border-brand-200 text-brand-700">
            <td className="px-3 py-1 pt-1.5">Long ≥ 6,5 ft</td>
            <td className="whitespace-nowrap px-3 py-1 pt-1.5 text-right tabular-nums">
              {m3(r.longM3)}
            </td>
            <td className="whitespace-nowrap px-3 py-1 pt-1.5 text-right tabular-nums">
              {fmtPct((r.longM3 / r.totalM3) * 100, 1)}
            </td>
          </tr>
          <tr className="text-brand-700">
            <td className="px-3 pb-2 pt-1">Short</td>
            <td className="whitespace-nowrap px-3 pb-2 pt-1 text-right tabular-nums">
              {m3(r.shortM3)}
            </td>
            <td className="whitespace-nowrap px-3 pb-2 pt-1 text-right tabular-nums">
              {fmtPct((r.shortM3 / r.totalM3) * 100, 1)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
