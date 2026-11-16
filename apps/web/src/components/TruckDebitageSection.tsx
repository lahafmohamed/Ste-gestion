import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { TruckDTO } from "@ste/shared";
import { runPieceCount, runTotalM3, truckSawnProgress } from "@ste/shared";
import { contractsApi, productionApi } from "../lib/api";
import { fmtInt, fmtM3, fmtPct } from "../lib/format";
import { buttonCls } from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import { EmptyState, Notice, QueryError } from "./ui/Feedback";
import { SkeletonLine } from "./ui/Skeleton";
import { IconChevronRight } from "./icons";

// Miroir de la feuille « DEBITE TECK DU … » (docs/pdf5) : elle est tenue PAR
// CAMION et porte, à côté du tableau de stock, un encadré B/L · cubage brousse ·
// cubage parc · débité · rend parc. Dans l'app la session de débitage est
// l'unité de saisie (elle peut couvrir plusieurs camions) — cet écran recompose
// la vue camion, qui est celle que le parc lit sur papier.

function Line({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-sm text-brand-600">
        {label}
        {hint && <span className="ml-1.5 text-xs text-brand-500">{hint}</span>}
      </span>
      {/* Chiffres en text-base : l'encadré se lit sur la tablette du parc. */}
      <span
        className={`shrink-0 text-right text-base tabular-nums text-brand-900 ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function TruckDebitageSection({ truck }: { truck: TruckDTO }) {
  // Mêmes clés que la fiche contrat → souvent déjà en cache en arrivant d'ici.
  const stats = useQuery({
    queryKey: ["truck-stats", truck.contractId],
    queryFn: () => contractsApi.truckStats(truck.contractId),
  });
  // Filtré par camion : une session qui mélange deux contrats n'a plus de
  // contrat, elle doit quand même apparaître sur la fiche de son camion.
  const runs = useQuery({
    queryKey: ["production", "truck", truck.id],
    queryFn: () => productionApi.list({ truckId: truck.id }),
  });

  const s = stats.data?.find((x) => x.truckId === truck.id);
  const myRuns = runs.data ?? [];

  // N° des billons de CE camion, pour nommer les billes passées à la scie.
  const girthLogs = truck.measurements.find((m) => m.context === "YARD_GIRTH")?.logs ?? [];
  const billonNoById = new Map(girthLogs.map((l) => [l.id, l.externalId ?? "?"]));

  // Session couvrant plusieurs camions : le débité du camion est une quote-part,
  // pas une mesure. À dire, sinon le chiffre se lit comme exact.
  const shared = myRuns.some((r) => r.truckIds.length > 1);

  // Avancement billon par billon — quel bois du camion reste à scier.
  const progress = truckSawnProgress(truck, runs.data ?? []);

  const debited = Number(s?.debitedM3 ?? 0);
  const girth = Number(s?.girthM3 ?? 0);
  // Billons déjà passés à la scie : base du rendement d'un camion entamé.
  const sawnGirth = Number(s?.sawnGirthM3 ?? 0);
  const partial = sawnGirth > 0 && sawnGirth < girth - 0.0005;

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          debited > 0 ? (
            <span className="text-sm font-semibold tabular-nums text-brand-900">
              {fmtM3(debited)}
            </span>
          ) : undefined
        }
      >
        Débitage
      </SectionHeading>

      <div className="rounded-xl bg-white p-4 shadow-card">
        {stats.isError || runs.isError ? (
          <QueryError
            error={stats.error ?? runs.error}
            onRetry={() => {
              stats.refetch();
              runs.refetch();
            }}
          >
            Impossible de charger le débitage du camion
          </QueryError>
        ) : stats.isLoading || runs.isLoading ? (
          <div className="space-y-2.5" aria-busy="true">
            <SkeletonLine className="w-1/3" />
            <SkeletonLine className="w-2/3" />
            <SkeletonLine className="w-1/2" />
          </div>
        ) : debited === 0 ? (
          // Pas encore scié : dire ce qui attend et, s'il y a du bois billonné,
          // le geste suivant — un vrai bouton, plus un lien perdu dans la phrase.
          <EmptyState
            action={
              girth > 0 && (
                <Link to="/debitage" className={buttonCls("secondary", "sm")}>
                  Ouvrir une session de débitage
                </Link>
              )
            }
          >
            {girth > 0 ? (
              <>
                Camion pas encore scié :{" "}
                <span className="tabular-nums">
                  {s?.billonCount ?? 0} billon{(s?.billonCount ?? 0) > 1 ? "s" : ""} sur parc (
                  {fmtM3(girth)})
                </span>
                .
              </>
            ) : (
              "Camion pas encore scié. Le billonner d'abord."
            )}
          </EmptyState>
        ) : (
          <>
            {/* Encadré de la feuille DEBITE, mêmes intitulés que le papier. */}
            <div className="divide-y divide-brand-100">
              {/* Le B/L ouvre l'encadré, comme sur la feuille : c'est par lui
                  que le parc rapproche la ligne sciée du camion arrivé. */}
              <Line label="B/L" value={truck.deliveryNote || "—"} />
              <Line
                label="Cubage brousse"
                hint="bordereau"
                value={Number(s!.fieldM3) > 0 ? fmtM3(s!.fieldM3) : "—"}
              />
              <Line
                label="Cubage parc"
                hint="billons girth"
                value={girth > 0 ? fmtM3(girth) : "—"}
              />
              {/* Camion entamé : le rendement se lit sur ce qui est passé à la
                  scie — divisé par tous les billons, il chutait de moitié. */}
              {partial && (
                <Line
                  label="Billons sciés"
                  hint={`${progress.sawn}/${progress.total}`}
                  value={fmtM3(sawnGirth)}
                />
              )}
              <Line label="Débité" value={fmtM3(debited)} strong />
              <Line
                label="Rendement parc"
                hint={partial ? "débité ÷ billons sciés" : "débité ÷ billons"}
                value={sawnGirth > 0 ? fmtPct(Number(s!.outputPct)) : "—"}
              />
            </div>

            {/* Où en est le camion — l'info que la feuille papier ne donne pas. */}
            {progress.total > 0 &&
              (progress.complete ? (
                <Notice tone="success" className="mt-2">
                  Camion entièrement scié ({progress.total} billons).
                </Notice>
              ) : (
                <Notice tone="warn" className="mt-2">
                  <strong className="tabular-nums">
                    {progress.sawn}/{progress.total}
                  </strong>{" "}
                  billons sciés. Restent :{" "}
                  {progress.remaining
                    .slice(0, 24)
                    .map((l) => l.externalId ?? `#${l.position}`)
                    .join(", ")}
                  {progress.remaining.length > 24 && ` … +${progress.remaining.length - 24}`}
                </Notice>
              ))}

            {shared && (
              <Notice tone="warn" className="mt-2">
                Une session porte sur plusieurs camions : le débité ci-dessus est une
                quote-part (volume de session ÷ nb de camions liés), pas une mesure propre à ce
                camion.
              </Notice>
            )}

            {/* Splits Daily Truck Log — ce que le débité a donné, par produit.
                Mêmes lignes que l'encadré plutôt qu'une rangée de pastilles à
                parenthèses imbriquées : les chiffres s'alignent à droite. */}
            <div className="mt-4 border-t border-brand-100 pt-3">
              <h3 className="mb-1 text-sm font-medium text-brand-700">Répartition du débité</h3>
              <div className="divide-y divide-brand-100">
                <Line
                  label="MS"
                  hint={`main ${fmtM3(s!.mainM3)} · 1,5″ ${fmtM3(s!.band15M3)}`}
                  value={fmtM3(s!.msM3)}
                />
                <Line
                  label="1″"
                  hint={fmtPct(Number(s!.oneInchPct), 0)}
                  value={fmtM3(s!.oneInchM3)}
                />
                <Line label="Long" hint="≥ 6,5 ft" value={fmtM3(s!.longM3)} />
                <Line label="Court" value={fmtM3(s!.shortM3)} />
                {s!.costPerM3 && (
                  <Line
                    label="Coût débité"
                    hint={s!.costMsPerM3 ? `${fmtInt(s!.costMsPerM3)} FCFA/m³ MS` : undefined}
                    value={`${fmtInt(s!.costPerM3)} FCFA/m³`}
                  />
                )}
              </div>
            </div>

            {/* Sessions : la saisie reste par session, on y renvoie pour le détail. */}
            <div className="mt-4 border-t border-brand-100 pt-3">
              <h3 className="mb-2 text-sm font-medium text-brand-700">
                {myRuns.length} session{myRuns.length > 1 ? "s" : ""} de débitage
              </h3>
              <div className="space-y-1.5">
                {myRuns.map((r) => {
                  // logIds vides = camion entier passé à la scie (pas de billes précisées).
                  const mine = r.logIds.filter((id) => billonNoById.has(id));
                  return (
                    // Tuile posée dans la carte : aplat clair, pas d'ombre empilée
                    // sur l'ombre de la carte ; le chevron dit « ouvre la session ».
                    <Link
                      key={r.id}
                      to={`/production-runs/${r.id}`}
                      className="group block rounded-lg bg-brand-50 p-3 ring-1 ring-inset ring-brand-100 transition-colors duration-150 ease-out hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 text-base font-medium text-brand-900">
                          {new Date(r.producedAt).toLocaleDateString("fr-FR")}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-base tabular-nums text-brand-800">
                          {fmtM3(runTotalM3(r))}
                          <IconChevronRight
                            width={18}
                            height={18}
                            aria-hidden
                            className="text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                          />
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm tabular-nums text-brand-600">
                        {fmtInt(runPieceCount(r))} pièces · {r.lines.length} lignes
                        {r.truckIds.length > 1 &&
                          ` · session partagée entre ${r.truckIds.length} camions`}
                      </div>
                      <div className="mt-1 text-pretty text-sm text-brand-600">
                        {mine.length > 0
                          ? `Billons sciés : ${mine.map((id) => billonNoById.get(id)).join(", ")}`
                          : "Camion entier (billons non précisés)"}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
