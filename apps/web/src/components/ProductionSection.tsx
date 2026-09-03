import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  runGroupTotals,
  runPieceCount,
  runTotalM3,
  SIZE_GROUP_LABELS,
  truckSawnProgress,
  type ProductionRunCreateInput,
  type SizeGroup,
  type TruckSawnProgress,
} from "@ste/shared";
import { productionApi, trucksApi } from "../lib/api";
import { fmtInt, fmtM3, fmtNum } from "../lib/format";
import SawnEntry from "./SawnEntry";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import { EmptyState, QueryError } from "./ui/Feedback";
import { SkeletonList } from "./ui/Skeleton";

export default function ProductionSection({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const runs = useQuery({
    queryKey: ["production", contractId],
    queryFn: () => productionApi.listByContract(contractId),
  });

  const trucks = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId),
  });

  // État débitage par camion — répond à « quel camion reste à scier ? ».
  // Ordre de lecture parc : en cours, puis pas commencés, puis à billonner,
  // les finis en dernier.
  const truckProgress = (trucks.data ?? []).map((t) => ({
    truck: t,
    p: truckSawnProgress(t, runs.data ?? []),
  }));
  const progressRank = ({ p }: { p: TruckSawnProgress }) =>
    p.complete ? 3 : p.sawn > 0 ? 0 : p.total > 0 ? 1 : 2;
  const sortedProgress = [...truckProgress].sort((a, b) => progressRank(a) - progressRank(b));

  const create = useMutation({
    mutationFn: productionApi.create,
    onSuccess: () => {
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["production", contractId] });
      qc.invalidateQueries({ queryKey: ["cutting", contractId] });
      qc.invalidateQueries({ queryKey: ["trucks", contractId] });
      qc.invalidateQueries({ queryKey: ["summary", contractId] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          <Button size="xs" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Session"}
          </Button>
        }
      >
        Débitage ({runs.data?.length ?? 0} sessions)
      </SectionHeading>

      {showForm && (
        <div className="mb-3 rounded-xl bg-white shadow-card p-4">
          <SawnEntry
            saving={create.isPending}
            trucks={trucks.data}
            runs={runs.data}
            onSave={(data) =>
              create.mutate({ ...data, contractId } as ProductionRunCreateInput)
            }
          />
        </div>
      )}

      {/* Avancement par camion — la question du parc est « qu'est-ce qui reste
          à scier ? », pas « quelles sessions ont eu lieu ? ». */}
      {sortedProgress.length > 0 && (
        <div className="mb-3 rounded-xl bg-white shadow-card p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">
            Camions — avancement sciage
          </div>
          <div className="divide-y divide-brand-50">
            {sortedProgress.map(({ truck: t, p }) => (
              <Link
                key={t.id}
                to={`/trucks/${t.id}`}
                className="flex min-h-touch items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-brand-50 active:bg-brand-100"
              >
                <span className="w-28 shrink-0 truncate text-sm font-medium text-brand-900">
                  {t.registration}
                  {t.deliveryNote && (
                    <span className="ml-1 text-xs font-normal text-brand-400">
                      B/L {t.deliveryNote}
                    </span>
                  )}
                </span>
                {p.total > 0 ? (
                  <>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-100">
                      <div
                        className={`h-full rounded-full ${p.complete ? "bg-parc-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.round((p.sawn / p.total) * 100)}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-sm tabular-nums text-brand-500">
                      {p.sawn}/{p.total} billons
                    </span>
                    <Badge
                      tone={p.complete ? "parc" : p.sawn > 0 ? "amber" : "brand"}
                      className="w-20 shrink-0 justify-center"
                    >
                      {p.complete ? "✓ Fini" : p.sawn > 0 ? "En cours" : "À scier"}
                    </Badge>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1" />
                    {/* Scié « camion entier » sans étalage girth : fini quand même. */}
                    <Badge
                      tone={p.complete ? "parc" : "brand"}
                      className="w-20 shrink-0 justify-center"
                    >
                      {p.complete ? "✓ Fini" : "À billonner"}
                    </Badge>
                  </>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {runs.isLoading && <SkeletonList count={2} lines={1} />}
        {runs.isError && (
          <QueryError error={runs.error} onRetry={() => runs.refetch()}>
            Impossible de charger les sessions de débitage
          </QueryError>
        )}
        {runs.data?.length === 0 && !showForm && (
          <EmptyState>Aucune session de débitage.</EmptyState>
        )}
        {runs.data?.map((r) => {
          const groups = runGroupTotals(r);
          const linked = (trucks.data ?? []).filter((t) => r.truckIds.includes(t.id));
          return (
            <Link
              key={r.id}
              to={`/production-runs/${r.id}`}
              className="block rounded-xl bg-white p-3 shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:shadow-card-hover active:scale-[0.99] active:shadow-card"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-brand-900">
                  {new Date(r.producedAt).toLocaleDateString("fr-FR")}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <div className="text-sm font-semibold text-brand-900">
                  {fmtM3(runTotalM3(r))}
                </div>
              </div>
              <div className="mt-1 text-sm text-brand-500">
                {fmtInt(runPieceCount(r))} pièces · {r.lines.length} lignes
                {(Object.keys(groups) as SizeGroup[])
                  .filter((g) => groups[g] > 0)
                  .map(
                    (g) => ` · ${SIZE_GROUP_LABELS[g]} ${fmtNum(groups[g].toFixed(3))}`
                  )
                  .join("")}
              </div>
              {r.truckIds.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {linked.map((t) => (
                    <Badge key={t.id}>{t.registration}</Badge>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
