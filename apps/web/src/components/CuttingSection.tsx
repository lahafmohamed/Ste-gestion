import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS } from "@ste/shared";
import { productionApi } from "../lib/api";
import { fmtDec3, fmtInt } from "../lib/format";
import CuttingCharts from "./CuttingCharts";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import { SectionHeading } from "./ui/Card";
import { EmptyState, QueryError } from "./ui/Feedback";
import { SkeletonCard } from "./ui/Skeleton";
import { TableWrap } from "./ui/Table";

// Sans contrat : tout le débité, tous contrats confondus (page Débitage).
export default function CuttingSection({ contractId }: { contractId?: string }) {
  const q = useQuery({
    queryKey: ["cutting", contractId ?? "all"],
    queryFn: () => productionApi.cutting(contractId),
  });

  const total = q.data ? Number(q.data.totalM3) : 0;

  return (
    <section className="mt-5">
      <SectionHeading>Débité par taille</SectionHeading>

      {q.isLoading && <SkeletonCard lines={3} />}
      {q.isError && (
        <QueryError error={q.error} onRetry={() => q.refetch()}>
          Impossible de charger le débité par taille
        </QueryError>
      )}
      {/* Section toujours visible : disparaître sans rien dire ressemblait à un bug. */}
      {q.data && total <= 0 && <EmptyState>Aucun débit enregistré.</EmptyState>}

      {q.data && total > 0 && (
        <div className="rounded-xl bg-white shadow-card p-4">
          <CuttingCharts data={q.data} />

          {/* Table par taille */}
          <TableWrap>
            <table className="w-full min-w-[440px] text-base">
              <thead>
                <tr className="text-left text-xs text-brand-500">
                  <th className="py-1 pr-4 font-normal">Taille</th>
                  <th className="py-1 pr-4 font-normal">Groupe</th>
                  <th className="py-1 pr-4 text-right font-normal">m³</th>
                  <th className="py-1 text-right font-normal">Pièces</th>
                </tr>
              </thead>
              <tbody>
                {q.data.sizes.map((s) => (
                  <tr key={s.code} className="border-t border-brand-100">
                    <td className="py-1 pr-4 font-medium">{s.code}</td>
                    <td className="py-1 pr-4">
                      <Badge tone={SIZE_GROUP_TONE[s.group]}>{SIZE_GROUP_LABELS[s.group]}</Badge>
                    </td>
                    <td className="py-1 pr-4 text-right tabular-nums">{fmtDec3(s.volumeM3)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtInt(s.pieces)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-200 font-semibold">
                  <td className="py-1.5 pr-4" colSpan={2}>
                    TOTAL
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{fmtDec3(q.data.totalM3)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtInt(q.data.totalPieces)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </div>
      )}
    </section>
  );
}
