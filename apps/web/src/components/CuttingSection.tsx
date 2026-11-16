import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS } from "@ste/shared";
import { productionApi } from "../lib/api";
import { fmtDec3, fmtInt } from "../lib/format";
import CuttingCharts from "./CuttingCharts";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import { cardCls, SectionHeading } from "./ui/Card";
import { EmptyState, QueryError } from "./ui/Feedback";
import { SkeletonCard } from "./ui/Skeleton";
import { TableWrap, Td, Th } from "./ui/Table";

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
      {q.data && total <= 0 && (
        <EmptyState>
          Aucun débit enregistré. Les tailles apparaissent ici dès la première session.
        </EmptyState>
      )}

      {q.data && total > 0 && (
        <div className={`${cardCls} p-4`}>
          <CuttingCharts data={q.data} />

          {/* Table par taille */}
          <TableWrap>
            <table className="w-full min-w-[440px] text-base">
              <thead>
                <tr className="text-left text-xs text-brand-500">
                  <Th>Taille</Th>
                  <Th>Groupe</Th>
                  <Th right>m³</Th>
                  <Th right>Pièces</Th>
                </tr>
              </thead>
              <tbody>
                {q.data.sizes.map((s) => (
                  <tr key={s.code} className="border-t border-brand-100">
                    <Td className="font-medium text-brand-900">{s.code}</Td>
                    <Td>
                      <Badge tone={SIZE_GROUP_TONE[s.group]}>{SIZE_GROUP_LABELS[s.group]}</Badge>
                    </Td>
                    <Td num>{fmtDec3(s.volumeM3)}</Td>
                    <Td num>{fmtInt(s.pieces)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-200 font-semibold text-brand-900">
                  <Td colSpan={2} className="py-1.5">
                    Total
                  </Td>
                  <Td num className="py-1.5">
                    {fmtDec3(q.data.totalM3)}
                  </Td>
                  <Td num className="py-1.5">
                    {fmtInt(q.data.totalPieces)}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </div>
      )}
    </section>
  );
}
