import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { TruckDTO } from "@ste/shared";
import { runPieceCount, runTotalM3, truckSawnProgress } from "@ste/shared";
import { contractsApi, productionApi } from "../lib/api";
import { fmtInt, fmtM3, fmtNum, fmtPct } from "../lib/format";
import Badge from "./ui/Badge";
import { SectionHeading } from "./ui/Card";
import { Notice, QueryError } from "./ui/Feedback";
import { SkeletonLine } from "./ui/Skeleton";
import { IconCheck } from "./icons";

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
      <span className="text-sm text-brand-500">
        {label}
        {hint && <span className="ml-1.5 text-xs text-brand-500">{hint}</span>}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold text-brand-900" : "text-sm text-brand-900"}`}
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
            <span className="text-sm font-semibold text-brand-900">{fmtM3(debited)}</span>
          ) : undefined
        }
      >
        Débitage
      </SectionHeading>

      <div className="rounded-xl bg-white shadow-card p-4">
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
          <div className="text-sm text-brand-500">
            Camion pas encore scié.
            {girth > 0 ? (
              <>
                {" "}
                {s?.billonCount ?? 0} billon{(s?.billonCount ?? 0) > 1 ? "s" : ""} sur parc (
                {fmtM3(girth)}).{" "}
                <Link to="/debitage" className="underline hover:text-brand-900">
                  Ouvrir une session de débitage
                </Link>
              </>
            ) : (
              " Billonner le camion d'abord."
            )}
          </div>
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
            {progress.total > 0 && (
              <div
                className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                  progress.complete
                    ? "bg-parc-50 text-parc-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {progress.complete ? (
                  <span className="inline-flex items-center gap-1.5"><IconCheck width={16} height={16} className="shrink-0" aria-hidden />Camion entièrement scié ({progress.total} billons)</span>
                ) : (
                  <>
                    <strong className="tabular-nums">
                      {progress.sawn}/{progress.total}
                    </strong>{" "}
                    billons sciés — restent :{" "}
                    {progress.remaining
                      .slice(0, 24)
                      .map((l) => l.externalId ?? `#${l.position}`)
                      .join(", ")}
                    {progress.remaining.length > 24 &&
                      ` … +${progress.remaining.length - 24}`}
                  </>
                )}
              </div>
            )}

            {shared && (
              <Notice tone="warn" className="mt-2">
                Une session porte sur plusieurs camions : le débité ci-dessus est une
                quote-part (volume de session ÷ nb de camions liés), pas une mesure propre à ce
                camion.
              </Notice>
            )}

            {/* Splits Daily Truck Log — ce que le débité a donné, par produit. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="info">
                MS {fmtM3(Number(s!.msM3))}
                <span className="ml-1 font-normal">
                  (main {fmtNum(Number(s!.mainM3).toFixed(3))} · 1,5″{" "}
                  {fmtNum(Number(s!.band15M3).toFixed(3))})
                </span>
              </Badge>
              <Badge tone="accent">
                1″ {fmtM3(Number(s!.oneInchM3))} ({fmtPct(Number(s!.oneInchPct), 0)}
                )
              </Badge>
              <Badge>
                Long ≥ 6,5 ft {fmtNum(Number(s!.longM3).toFixed(3))} · court{" "}
                {fmtM3(Number(s!.shortM3))}
              </Badge>
              {s!.costPerM3 && (
                <Badge>
                  Coût {fmtInt(s!.costPerM3)} FCFA/m³ débité
                  {s!.costMsPerM3 ? ` · ${fmtInt(s!.costMsPerM3)} /m³ MS` : ""}
                </Badge>
              )}
            </div>

            {/* Sessions : la saisie reste par session, on y renvoie pour le détail. */}
            <div className="mt-4 border-t border-brand-100 pt-3">
              <div className="mb-1.5 text-xs font-medium text-brand-500">
                {myRuns.length} session{myRuns.length > 1 ? "s" : ""} de débitage
              </div>
              <div className="space-y-1.5">
                {myRuns.map((r) => {
                  // logIds vides = camion entier passé à la scie (pas de billes précisées).
                  const mine = r.logIds.filter((id) => billonNoById.has(id));
                  return (
                    <Link
                      key={r.id}
                      to={`/production-runs/${r.id}`}
                      className="block rounded-lg bg-white p-2.5 shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:shadow-card-hover active:scale-[0.99] active:shadow-card"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-brand-900">
                          {new Date(r.producedAt).toLocaleDateString("fr-FR")}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-brand-700">
                          {fmtM3(runTotalM3(r))}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm text-brand-500">
                        {fmtInt(runPieceCount(r))} pièces · {r.lines.length} lignes
                        {r.truckIds.length > 1 &&
                          ` · session partagée entre ${r.truckIds.length} camions`}
                      </div>
                      <div className="mt-1 text-sm text-brand-500">
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
