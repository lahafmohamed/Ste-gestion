import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { TruckDTO } from "@ste/shared";
import { runPieceCount, runTotalM3, truckSawnProgress } from "@ste/shared";
import { contractsApi, productionApi } from "../lib/api";
import { fmtInt, fmtM3, fmtNum, fmtPct } from "../lib/format";
import Badge from "./ui/Badge";
import { QueryError } from "./ui/Feedback";

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
      <span className="text-sm text-slate-500">
        {label}
        {hint && <span className="ml-1.5 text-xs text-slate-400">{hint}</span>}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold text-slate-900" : "text-sm text-slate-900"}`}
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
  const runs = useQuery({
    queryKey: ["production", truck.contractId],
    queryFn: () => productionApi.listByContract(truck.contractId),
  });

  const s = stats.data?.find((x) => x.truckId === truck.id);
  const myRuns = (runs.data ?? []).filter((r) => r.truckIds.includes(truck.id));

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

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Débitage</h2>
        {debited > 0 && (
          <span className="text-sm font-semibold text-slate-900">{fmtM3(debited)}</span>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
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
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : debited === 0 ? (
          <div className="text-sm text-slate-500">
            Camion pas encore scié.
            {girth > 0 ? (
              <>
                {" "}
                {s?.billonCount ?? 0} billon{(s?.billonCount ?? 0) > 1 ? "s" : ""} sur parc (
                {fmtM3(girth)}).{" "}
                <Link to="/debitage" className="underline hover:text-slate-900">
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
            <div className="divide-y divide-slate-100">
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
              <Line label="Débité" value={fmtM3(debited)} strong />
              <Line
                label="Rendement parc"
                hint="débité ÷ billons"
                value={girth > 0 ? fmtPct(Number(s!.outputPct)) : "—"}
              />
            </div>

            {/* Où en est le camion — l'info que la feuille papier ne donne pas. */}
            {progress.total > 0 && (
              <div
                className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                  progress.complete
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {progress.complete ? (
                  <>✓ Camion entièrement scié ({progress.total} billons)</>
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
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ Une session porte sur plusieurs camions : le débité ci-dessus est une
                quote-part (volume de session ÷ nb de camions liés), pas une mesure propre à ce
                camion.
              </p>
            )}

            {/* Splits Daily Truck Log — ce que le débité a donné, par produit. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="sky">
                MS {fmtNum(Number(s!.msM3).toFixed(3))} m³
                <span className="opacity-70">
                  {" "}
                  (main {fmtNum(Number(s!.mainM3).toFixed(3))} · 1,5″{" "}
                  {fmtNum(Number(s!.band15M3).toFixed(3))})
                </span>
              </Badge>
              <Badge tone="violet">
                1″ {fmtNum(Number(s!.oneInchM3).toFixed(3))} m³ ({fmtPct(Number(s!.oneInchPct), 0)}
                )
              </Badge>
              <Badge>
                Long ≥ 6,5 ft {fmtNum(Number(s!.longM3).toFixed(3))} · court{" "}
                {fmtNum(Number(s!.shortM3).toFixed(3))} m³
              </Badge>
              {s!.costPerM3 && (
                <Badge>
                  Coût {fmtInt(s!.costPerM3)} FCFA/m³ débité
                  {s!.costMsPerM3 ? ` · ${fmtInt(s!.costMsPerM3)} /m³ MS` : ""}
                </Badge>
              )}
            </div>

            {/* Sessions : la saisie reste par session, on y renvoie pour le détail. */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-xs font-medium text-slate-500">
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
                      className="block rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-slate-400 active:border-slate-500 active:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-900">
                          {new Date(r.producedAt).toLocaleDateString("fr-FR")}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-slate-700">
                          {fmtM3(runTotalM3(r))}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {fmtInt(runPieceCount(r))} pièces · {r.lines.length} lignes
                        {r.truckIds.length > 1 &&
                          ` · session partagée entre ${r.truckIds.length} camions`}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
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
