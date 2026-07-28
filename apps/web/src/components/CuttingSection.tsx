import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS, type SizeGroup } from "@ste/shared";
import { productionApi } from "../lib/api";
import { fmtInt, fmtNum } from "../lib/format";
import CuttingCharts from "./CuttingCharts";

const GROUP_BADGE: Record<SizeGroup, string> = {
  MAIN: "bg-sky-50 text-sky-700",
  SIDE: "bg-amber-50 text-amber-700",
  ONE_INCH: "bg-violet-50 text-violet-700",
  OTHER: "bg-slate-100 text-slate-500",
};

export default function CuttingSection({ contractId }: { contractId: string }) {
  const q = useQuery({
    queryKey: ["cutting", contractId],
    queryFn: () => productionApi.cutting(contractId),
  });

  if (q.isLoading || !q.data) return null;
  const { sizes, totalM3, totalPieces } = q.data;
  const total = Number(totalM3);
  if (total <= 0) return null;

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Contracts cutting (débité par taille)
      </h2>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <CuttingCharts data={q.data} />

        {/* Table par taille */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-4 font-normal">Taille</th>
                <th className="py-1 pr-4 font-normal">Groupe</th>
                <th className="py-1 pr-4 text-right font-normal">m³</th>
                <th className="py-1 text-right font-normal">Pièces</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s.code} className="border-t border-slate-100">
                  <td className="py-1 pr-4 font-medium">{s.code}</td>
                  <td className="py-1 pr-4">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs ${GROUP_BADGE[s.group]}`}
                    >
                      {SIZE_GROUP_LABELS[s.group]}
                    </span>
                  </td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(s.volumeM3)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtInt(s.pieces)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="py-1.5 pr-4" colSpan={2}>
                  TOTAL
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{fmtNum(totalM3)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtInt(totalPieces)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
