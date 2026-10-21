import { useQuery } from "@tanstack/react-query";
import type { ContractDTO } from "@ste/shared";
import { TRUCK_ALERT } from "@ste/shared";
import { contractsApi } from "../lib/api";
import { fmtInt, fmtNum, fmtPct } from "../lib/format";
import Badge from "./ui/Badge";
import Card, { SectionHeading } from "./ui/Card";
import { QueryError } from "./ui/Feedback";
import { TableWrap, WideBleed } from "./ui/Table";

const num = (v: string | number) => fmtNum(Number(Number(v).toFixed(3)));
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

// Blocs de colonnes du classeur Daily Truck Log, teintés pour qu'on suive une
// ligne de 17 colonnes sans se perdre : parc (comptage + 3 cubages) → débitage
// (les tailles) → sortie (rendement).
const PARC = "bg-parc-50/60";
const DEB = "bg-accent-50/60";
const OUT = "bg-brand-50";
// Mise en forme conditionnelle du classeur : la cellule hors seuil passe en
// rouge. Indicatif — aucun calcul n'en dépend (cf. TRUCK_ALERT).
const ALERT = "bg-red-50 font-medium text-red-700";

/** Paramètre du contrat — bandeau au-dessus du tableau (en-tête du classeur). */
function Param({
  label,
  value,
  tone = "brand",
}: {
  label: string;
  value: string;
  tone?: "brand" | "accent";
}) {
  const skin =
    tone === "accent"
      ? "bg-accent-50 text-accent-800 ring-accent-100"
      : "bg-brand-50 text-brand-900 ring-brand-100";
  return (
    <div className={`rounded-lg px-2.5 py-1.5 ring-1 ring-inset ${skin}`}>
      <div className="text-xs text-brand-600">{label}</div>
      <div className="tabular-nums text-sm font-semibold">{value}</div>
    </div>
  );
}

export default function TruckStatsSection({ contract }: { contract: ContractDTO }) {
  const contractId = contract.id;
  const q = useQuery({
    queryKey: ["truck-stats", contractId],
    queryFn: () => contractsApi.truckStats(contractId),
  });

  // Échec du chargement : le dire, au lieu d'escamoter le tableau comme s'il
  // n'y avait rien à analyser.
  if (q.isError)
    return (
      <section className="mt-5">
        <SectionHeading>Analyse par camion</SectionHeading>
        <QueryError error={q.error} onRetry={() => q.refetch()}>
          Impossible de charger l'analyse par camion
        </QueryError>
      </section>
    );

  if (!q.data || q.data.length === 0) return null;

  // Colonnes A/B/C (billes par relevé d'étalage) — affichées seulement si un
  // camion a plusieurs relevés, sinon # Billes suffit.
  const maxSessions = Math.max(...q.data.map((t) => t.billeCounts.length));
  const sessionLetters =
    maxSessions > 1
      ? Array.from({ length: maxSessions }, (_, i) => String.fromCharCode(65 + i))
      : [];

  // Bandeau de paramètres : chaque prix nul est retiré plutôt qu'affiché à 0 —
  // sur un contrat neuf, une rangée de zéros ne dit rien.
  const prices = [
    { label: "SODEFOR", value: contract.sodeforPrice },
    { label: "Ibrahim", value: contract.ibrahimPrice },
    { label: "Transport", value: contract.transportPrice },
    { label: "Cubage", value: contract.cubagePrice },
    { label: "1″", value: contract.oneInchPrice },
  ].filter((p) => Number(p.value) > 0);
  const budgets = [
    { label: "Budget bois", value: contract.woodBudget },
    { label: "Budget company", value: contract.companyBudget },
    { label: "Budget export", value: contract.exportBudget },
    { label: "Profit attendu", value: contract.expectedProfit ?? "0" },
  ].filter((b) => Number(b.value) > 0);

  const totals = q.data.reduce(
    (acc, t) => ({
      billes: acc.billes + t.billeCount,
      billons: acc.billons + t.billonCount,
      field: acc.field + Number(t.fieldM3),
      girth: acc.girth + Number(t.girthM3),
      sawnGirth: acc.sawnGirth + Number(t.sawnGirthM3),
      dia: acc.dia + Number(t.diaM3),
      debited: acc.debited + Number(t.debitedM3),
      main: acc.main + Number(t.mainM3),
      band15: acc.band15 + Number(t.band15M3),
      ms: acc.ms + Number(t.msM3),
      oneInch: acc.oneInch + Number(t.oneInchM3),
      long: acc.long + Number(t.longM3),
      short: acc.short + Number(t.shortM3),
    }),
    {
      billes: 0,
      billons: 0,
      field: 0,
      girth: 0,
      sawnGirth: 0,
      dia: 0,
      debited: 0,
      main: 0,
      band15: 0,
      ms: 0,
      oneInch: 0,
      long: 0,
      short: 0,
    }
  );

  return (
    <section className="mt-5">
      <SectionHeading>Analyse par camion</SectionHeading>
      {/* 17 colonnes : trop large pour la colonne de contenu, mais un écran de
          bureau a la place — on déborde à partir de lg. En dessous, défilement
          horizontal avec la colonne Camion figée, sinon on compare des chiffres
          sans savoir de quel camion ils sont. */}
      <WideBleed>
      <Card className="space-y-3">
        {/* Paramètres du contrat — l'en-tête du classeur : prix et budgets
            rappelés au-dessus du tableau, sans aller dans l'onglet Termes. */}
        {(prices.length > 0 || budgets.length > 0) && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {prices.map((p) => (
              <Param key={p.label} label={p.label} value={fmtInt(p.value)} />
            ))}
            {budgets.map((b) => (
              <Param key={b.label} label={b.label} value={fmtInt(b.value)} tone="accent" />
            ))}
          </div>
        )}
        <TableWrap stickyFirstCol>
          <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr className="text-left text-xs text-brand-500">
              <th className="py-1 pr-2 font-normal">Camion</th>
              <th className="py-1 pr-2 text-right font-normal">Date</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${PARC}`}>
                # Billes
              </th>
              {sessionLetters.map((l) => (
                <th key={l} className={`py-1 pr-2 text-right font-normal ${PARC}`}>
                  {l}
                </th>
              ))}
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${PARC}`}>
                # Billons
              </th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${PARC}`}>BDR</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${PARC}`}>Ø m³</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${PARC}`}>
                Circ m³
              </th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>
                Débité
              </th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>
                Main size
              </th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>1,5″</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>MS</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>1″</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>1″ %</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>Long</th>
              <th className={`py-1 pr-2 text-right font-normal whitespace-nowrap ${DEB}`}>Court</th>
              <th className={`py-1 text-right font-normal whitespace-nowrap ${OUT}`}>Rend.</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((t, i) => {
              const sawn = Number(t.debitedM3) > 0;
              // Seuils du classeur : chargement maigre ou rendement bas se
              // repèrent d'un coup d'œil, sans relire toute la colonne.
              const lowGirth = Number(t.girthM3) > 0 && Number(t.girthM3) < TRUCK_ALERT.girthM3;
              const sawnGirth = Number(t.sawnGirthM3);
              // Camion entamé : rendement sur les billons déjà passés à la scie.
              const partial = sawnGirth > 0 && sawnGirth < Number(t.girthM3) - 0.0005;
              const lowOutput =
                sawn && sawnGirth > 0 && Number(t.outputPct) < TRUCK_ALERT.outputPct;
              return (
                <tr key={t.truckId} className="border-t border-brand-100">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <span className="mr-1.5 tabular-nums text-xs text-brand-500">{i + 1}</span>
                    {/* B/L d'abord : c'est la clé du suivi (le classeur ne
                        connaît que lui), l'immatriculation suit. */}
                    <span className="font-medium">{t.deliveryNote ?? t.registration}</span>
                    {t.deliveryNote && (
                      <span className="ml-1.5 text-xs text-brand-500">{t.registration}</span>
                    )}
                    {t.sawn && (
                      <Badge tone="info" className="ml-1.5">
                        scié
                      </Badge>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums text-brand-500">
                    {day(t.arrivedAt)}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${PARC}`}>
                    {t.billeCount || "—"}
                  </td>
                  {sessionLetters.map((l, si) => (
                    <td
                      key={l}
                      className={`py-1 pr-2 text-right tabular-nums text-brand-500 ${PARC}`}
                    >
                      {t.billeCounts[si] ?? "—"}
                    </td>
                  ))}
                  <td className={`py-1 pr-2 text-right tabular-nums ${PARC}`}>
                    {t.billonCount || "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${PARC}`}>
                    {Number(t.fieldM3) > 0 ? num(t.fieldM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${PARC}`}>
                    {Number(t.diaM3) > 0 ? num(t.diaM3) : "—"}
                  </td>
                  <td
                    className={`py-1 pr-2 text-right tabular-nums ${lowGirth ? ALERT : PARC}`}
                    title={
                      lowGirth
                        ? `Billons sous ${TRUCK_ALERT.girthM3} m³ — chargement faible`
                        : undefined
                    }
                  >
                    {Number(t.girthM3) > 0 ? num(t.girthM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right font-medium tabular-nums ${DEB}`}>
                    {sawn ? num(t.debitedM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${DEB}`}>
                    {sawn ? num(t.mainM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${DEB}`}>
                    {sawn ? num(t.band15M3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${DEB}`}>
                    {sawn ? num(t.msM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${DEB}`}>
                    {sawn ? num(t.oneInchM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums text-brand-500 ${DEB}`}>
                    {sawn ? fmtPct(Number(t.oneInchPct)) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${DEB}`}>
                    {sawn ? num(t.longM3) : "—"}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${DEB}`}>
                    {sawn ? num(t.shortM3) : "—"}
                  </td>
                  <td
                    className={`py-1 text-right tabular-nums ${lowOutput ? ALERT : OUT}`}
                    title={
                      [
                        lowOutput && `Rendement sous ${TRUCK_ALERT.outputPct} % — à vérifier`,
                        partial &&
                          `Camion entamé : débité ÷ ${num(t.sawnGirthM3)} m³ de billons sciés (sur ${num(t.girthM3)} m³)`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  >
                    {sawn && sawnGirth > 0 ? fmtPct(Number(t.outputPct)) : "—"}
                    {partial && sawn && (
                      <span className="ml-0.5 text-brand-500" aria-hidden>
                        *
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-brand-200 font-semibold">
              <td className="py-1.5 pr-2">TOTAL</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-brand-500">
                {q.data.length}
              </td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${PARC}`}>{totals.billes}</td>
              {sessionLetters.map((l, i) => (
                <td key={l} className={`py-1.5 pr-2 text-right tabular-nums ${PARC}`}>
                  {q.data.reduce((s, t) => s + (t.billeCounts[i] ?? 0), 0)}
                </td>
              ))}
              <td className={`py-1.5 pr-2 text-right tabular-nums ${PARC}`}>{totals.billons}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${PARC}`}>{num(totals.field)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${PARC}`}>{num(totals.dia)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${PARC}`}>{num(totals.girth)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.debited)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.main)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.band15)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.ms)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.oneInch)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>
                {totals.debited > 0 ? fmtPct((totals.oneInch / totals.debited) * 100) : "—"}
              </td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.long)}</td>
              <td className={`py-1.5 pr-2 text-right tabular-nums ${DEB}`}>{num(totals.short)}</td>
              <td className={`py-1.5 text-right tabular-nums ${OUT}`}>
                {totals.sawnGirth > 0 ? fmtPct((totals.debited / totals.sawnGirth) * 100) : "—"}
              </td>
            </tr>
          </tfoot>
          </table>
        </TableWrap>
        {/* Légende de l'astérisque : sans elle, 62 % sur un camion à moitié
            scié se lirait comme le rendement du camion entier. */}
        {q.data.some(
          (t) =>
            Number(t.debitedM3) > 0 &&
            Number(t.sawnGirthM3) > 0 &&
            Number(t.sawnGirthM3) < Number(t.girthM3) - 0.0005
        ) && (
          <p className="text-xs text-brand-600">
            * Camion entamé : rendement calculé sur les billons déjà passés à la scie.
          </p>
        )}
      </Card>
      </WideBleed>
    </section>
  );
}
