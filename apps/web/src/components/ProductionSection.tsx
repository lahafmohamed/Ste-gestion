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
import { contractsApi, productionApi, trucksApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtInt, fmtM3 } from "../lib/format";
import { parcStage, truckLabel } from "../lib/trucks";
import SawnEntry from "./SawnEntry";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { cardCls, cardInteractiveCls, SectionHeading } from "./ui/Card";
import { EmptyState, QueryError } from "./ui/Feedback";
import { SkeletonCard, SkeletonList } from "./ui/Skeleton";
import { IconCheck, IconPlus } from "./icons";

// Le débité tombe dans le stock général : la page Débitage ne passe pas de
// contrat (tout le parc, tous contrats). La fiche contrat en passe un pour
// filtrer sa propre vue.
export default function ProductionSection({ contractId }: { contractId?: string }) {
  const qc = useQueryClient();
  const can = useCan();
  const [showForm, setShowForm] = useState(false);

  const runs = useQuery({
    queryKey: ["production", contractId ?? "all"],
    queryFn: () => productionApi.list({ contractId }),
  });

  const trucks = useQuery({
    queryKey: ["trucks", contractId ?? "all"],
    queryFn: () => (contractId ? trucksApi.listByContract(contractId) : trucksApi.list()),
  });

  // Tous contrats : le code contrat situe le camion (deux immats identiques
  // peuvent venir de deux contrats).
  const contracts = useQuery({
    queryKey: ["contracts"],
    queryFn: contractsApi.list,
    enabled: !contractId,
  });
  const codeByContract = new Map((contracts.data ?? []).map((c) => [c.id, c.code]));

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
      // Le stock général bouge : on invalide large plutôt que par contrat.
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["cutting"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          can("debitage.create") && (
            <Button size="xs" onClick={() => setShowForm((s) => !s)}>
              {showForm ? "Fermer" : <><IconPlus width={16} height={16} className="-ml-0.5" />Session</>}
            </Button>
          )
        }
      >
        {/* Compteur seulement une fois chargé : « 0 sessions » pendant la requête
            se lisait comme un débitage vide. */}
        Sessions de débitage
        {runs.data && (
          <span className="ml-1.5 font-normal tabular-nums text-brand-500">{runs.data.length}</span>
        )}
      </SectionHeading>

      {showForm && (
        <div className={`mb-3 ${cardCls} p-4`}>
          <SawnEntry
            saving={create.isPending}
            trucks={trucks.data}
            runs={runs.data}
            onSave={(data) => create.mutate(data)}
          />
        </div>
      )}

      {/* Avancement par camion — la question du parc est « qu'est-ce qui reste
          à scier ? », pas « quelles sessions ont eu lieu ? ». */}
      {trucks.isLoading && (
        <div className="mb-3">
          <SkeletonCard lines={3} />
        </div>
      )}
      {trucks.isError && (
        <div className="mb-3">
          <QueryError error={trucks.error} onRetry={() => trucks.refetch()}>
            Impossible de charger l'avancement des camions
          </QueryError>
        </div>
      )}
      {sortedProgress.length > 0 && (
        <div className={`mb-3 ${cardCls} p-3`}>
          <h3 className="mb-2 px-1 text-sm font-semibold text-brand-900">
            Avancement du sciage par camion
          </h3>
          <div className="divide-y divide-brand-100">
            {sortedProgress.map(({ truck: t, p }) => (
              <Link
                key={t.id}
                to={`/trucks/${t.id}`}
                className="flex min-h-touch items-center gap-3 rounded-lg px-1 py-1.5 transition-colors duration-150 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100"
              >
                {/* Le bordereau en tête — c'est le numéro que porte la feuille
                    DEBITE ; immat et contrat suivent, en seconde ligne. */}
                {/* Colonne plus large dès la tablette (le code contrat tenait
                    en « CT-2… ») ; texte complet en info-bulle sinon. */}
                {(() => {
                  const sub = [
                    t.deliveryNote ? t.registration : null,
                    contractId ? null : codeByContract.get(t.contractId),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <span
                      className="w-36 shrink-0 text-sm font-medium text-brand-900 sm:w-48"
                      title={sub ? `${truckLabel(t)} · ${sub}` : truckLabel(t)}
                    >
                      <span className="block truncate">{truckLabel(t)}</span>
                      <span className="block truncate text-xs font-normal text-brand-500">{sub}</span>
                    </span>
                  );
                })()}
                {p.total > 0 ? (
                  <>
                    {/* Barre décorative : le compte « 12/20 billons » à côté porte
                        l'information pour un lecteur d'écran. */}
                    <div
                      aria-hidden
                      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-100"
                    >
                      <div
                        className={`h-full rounded-full ${p.complete ? "bg-parc-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.round((p.sawn / p.total) * 100)}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-sm tabular-nums text-brand-600">
                      {p.sawn}/{p.total} billons
                    </span>
                    <Badge
                      tone={p.complete ? "parc" : p.sawn > 0 ? "amber" : "brand"}
                      className="w-24 shrink-0 justify-center"
                    >
                      {p.complete ? (
                        <>
                          <IconCheck width={14} height={14} className="-ml-0.5 mr-1 shrink-0" aria-hidden />
                          Fini
                        </>
                      ) : p.sawn > 0 ? (
                        "En cours"
                      ) : (
                        "À scier"
                      )}
                    </Badge>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1" />
                    {/* Scié « camion entier » sans étalage girth : fini quand même.
                        Sinon l'étape qui manque : un camion juste reçu est « à
                        étaler », pas « à billonner ». */}
                    <Badge
                      tone={p.complete ? "parc" : "brand"}
                      className="w-24 shrink-0 justify-center"
                    >
                      {p.complete ? (
                        <>
                          <IconCheck width={14} height={14} className="-ml-0.5 mr-1 shrink-0" aria-hidden />
                          Fini
                        </>
                      ) : parcStage(t) === "A_ETALER" ? (
                        "À étaler"
                      ) : (
                        "À billonner"
                      )}
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
          <EmptyState
            action={
              can("debitage.create") && (
                <Button variant="primary" onClick={() => setShowForm(true)}>
                  <IconPlus width={16} height={16} className="-ml-0.5" />
                  Saisir une session
                </Button>
              )
            }
          >
            Aucune session de débitage. Une session relève les avivés sortis de la scie, ligne
            par ligne.
          </EmptyState>
        )}
        {runs.data?.map((r) => {
          const groups = runGroupTotals(r);
          const linked = (trucks.data ?? []).filter((t) => r.truckIds.includes(t.id));
          return (
            <Link
              key={r.id}
              to={`/production-runs/${r.id}`}
              className={`block p-3 ${cardInteractiveCls}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 truncate font-medium text-brand-900">
                  {new Date(r.producedAt).toLocaleDateString("fr-FR")}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-brand-900">
                  {fmtM3(runTotalM3(r))}
                </div>
              </div>
              <div className="mt-1 text-pretty text-sm tabular-nums text-brand-600">
                {fmtInt(runPieceCount(r))} pièces · {r.lines.length} ligne
                {r.lines.length > 1 ? "s" : ""}
                {(Object.keys(groups) as SizeGroup[])
                  .filter((g) => groups[g] > 0)
                  .map(
                    (g) => ` · ${SIZE_GROUP_LABELS[g]} ${fmtM3(groups[g])}`
                  )
                  .join("")}
              </div>
              {r.truckIds.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {linked.map((t) => (
                    <Badge key={t.id} title={t.registration}>
                      {truckLabel(t)}
                    </Badge>
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
