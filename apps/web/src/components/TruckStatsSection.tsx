import { useQuery } from "@tanstack/react-query";
import { contractsApi } from "../lib/api";
import { fmtInt, fmtNum, fmtPct } from "../lib/format";
import Badge from "./ui/Badge";
import { QueryError } from "./ui/Feedback";

const num = (v: string | number) => fmtNum(Number(Number(v).toFixed(3)));

export default function TruckStatsSection({ contractId }: { contractId: string }) {
  const q = useQuery({
    queryKey: ["truck-stats", contractId],
    queryFn: () => contractsApi.truckStats(contractId),
  });

  // Échec du chargement : le dire, au lieu d'escamoter le tableau comme s'il
  // n'y avait rien à analyser.
  if (q.isError)
    return (
      <section className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Analyse par camion
        </h2>
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

  const totals = q.data.reduce(
    (acc, t) => ({
      billes: acc.billes + t.billeCount,
      billons: acc.billons + t.billonCount,
      field: acc.field + Number(t.fieldM3),
      girth: acc.girth + Number(t.girthM3),
      dia: acc.dia + Number(t.diaM3),
      debited: acc.debited + Number(t.debitedM3),
      main: acc.main + Number(t.mainM3),
      band15: acc.band15 + Number(t.band15M3),
      ms: acc.ms + Number(t.msM3),
      oneInch: acc.oneInch + Number(t.oneInchM3),
      long: acc.long + Number(t.longM3),
      short: acc.short + Number(t.shortM3),
      // Coût total reconstitué (coût/m³ × débité) pour la moyenne pondérée.
      cost: acc.cost + (t.costPerM3 ? Number(t.costPerM3) * Number(t.debitedM3) : 0),
    }),
    {
      billes: 0,
      billons: 0,
      field: 0,
      girth: 0,
      dia: 0,
      debited: 0,
      main: 0,
      band15: 0,
      ms: 0,
      oneInch: 0,
      long: 0,
      short: 0,
      cost: 0,
    }
  );

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Analyse par camion
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-normal">Camion</th>
              <th className="py-1 pr-3 text-right font-normal"># Billes</th>
              {sessionLetters.map((l) => (
                <th key={l} className="py-1 pr-3 text-right font-normal">
                  {l}
                </th>
              ))}
              <th className="py-1 pr-3 text-right font-normal"># Billons</th>
              <th className="py-1 pr-3 text-right font-normal">BDR</th>
              <th className="py-1 pr-3 text-right font-normal">Ø m³</th>
              <th className="py-1 pr-3 text-right font-normal">Circ m³</th>
              <th className="py-1 pr-3 text-right font-normal">Débité</th>
              <th className="py-1 pr-3 text-right font-normal">Main size</th>
              <th className="py-1 pr-3 text-right font-normal">1,5″</th>
              <th className="py-1 pr-3 text-right font-normal">MS</th>
              <th className="py-1 pr-3 text-right font-normal">1″</th>
              <th className="py-1 pr-3 text-right font-normal">1″ %</th>
              <th className="py-1 pr-3 text-right font-normal">Long</th>
              <th className="py-1 pr-3 text-right font-normal">Court</th>
              <th className="py-1 pr-3 text-right font-normal">Rend.</th>
              <th className="py-1 pr-3 text-right font-normal">Coût /m³</th>
              <th className="py-1 text-right font-normal">Coût /MS</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((t) => {
              const sawn = Number(t.debitedM3) > 0;
              return (
                <tr key={t.truckId} className="border-t border-slate-100">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    <span className="font-medium">{t.registration}</span>
                    {t.deliveryNote && (
                      <span className="ml-1.5 text-xs text-slate-400">{t.deliveryNote}</span>
                    )}
                    {t.sawn && (
                      <Badge tone="sky" className="ml-1.5">
                        scié
                      </Badge>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{t.billeCount || "—"}</td>
                  {sessionLetters.map((l, i) => (
                    <td key={l} className="py-1 pr-3 text-right tabular-nums text-slate-500">
                      {t.billeCounts[i] ?? "—"}
                    </td>
                  ))}
                  <td className="py-1 pr-3 text-right tabular-nums">{t.billonCount || "—"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {Number(t.fieldM3) > 0 ? num(t.fieldM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {Number(t.diaM3) > 0 ? num(t.diaM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {Number(t.girthM3) > 0 ? num(t.girthM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums font-medium">
                    {sawn ? num(t.debitedM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn ? num(t.mainM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn ? num(t.band15M3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn ? num(t.msM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn ? num(t.oneInchM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-500">
                    {sawn ? fmtPct(Number(t.oneInchPct)) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn ? num(t.longM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn ? num(t.shortM3) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {sawn && Number(t.girthM3) > 0 ? fmtPct(Number(t.outputPct)) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {t.costPerM3 ? fmtInt(t.costPerM3) : "—"}
                  </td>
                  <td className="py-1 text-right tabular-nums text-slate-500">
                    {t.costMsPerM3 ? fmtInt(t.costMsPerM3) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td className="py-1.5 pr-3">TOTAL</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{totals.billes}</td>
              {sessionLetters.map((l, i) => (
                <td key={l} className="py-1.5 pr-3 text-right tabular-nums">
                  {q.data.reduce((s, t) => s + (t.billeCounts[i] ?? 0), 0)}
                </td>
              ))}
              <td className="py-1.5 pr-3 text-right tabular-nums">{totals.billons}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.field)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.dia)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.girth)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.debited)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.main)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.band15)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.ms)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.oneInch)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {totals.debited > 0 ? fmtPct((totals.oneInch / totals.debited) * 100) : "—"}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.long)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(totals.short)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {totals.girth > 0 ? fmtPct((totals.debited / totals.girth) * 100) : "—"}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {totals.debited > 0 ? fmtInt(totals.cost / totals.debited) : "—"}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {totals.ms > 0 ? fmtInt(totals.cost / totals.ms) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-slate-400">
          Miroir du Daily Truck Log Excel. A/B/C = billes par relevé d'étalage (camion étalé en
          plusieurs fois). BDR = cubage brousse (bordereau) · Ø = étalage diamètre · Circ =
          billons girth. Main size = ép ≥ 3″ · 1,5″ = ép 1,5 – 3″ · MS = main
          + 1,5″ · 1″ = ép &lt; 1,5″. Long ≥ 6,5 ft. Rendement = débité ÷ billons girth. Coût =
          (BDR × prix SODEFOR + Ø × prix Ibrahim + transport + cubage) ÷ débité (ou ÷ MS), en
          FCFA/m³. Débité attribué : volume de session ÷ nb de camions liés (approximation si
          session multi-camions).
        </p>
      </div>
    </section>
  );
}
