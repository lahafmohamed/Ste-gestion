import { fmtM3, fmtPct } from "../lib/format";

// Jauge d'utilisation du quota contrat.
// Référence = cubage BROUSSE (mesuré bille par bille à l'état brut, sortie forêt) —
// c'est ce que SODEFOR décompte du quota. Le cubage des BILLONS (girth, mesurés
// après tronçonnage) sert au rendement, pas au quota.

function pctColor(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

/** Barre compacte (cartes liste / dashboard). */
export function QuotaBar({ brousseM3, quotaM3 }: { brousseM3: string; quotaM3: string }) {
  const quota = Number(quotaM3);
  const pct = quota > 0 ? (Number(brousseM3) / quota) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>
          {fmtM3(brousseM3)} / {fmtM3(quotaM3)}
        </span>
        <span className="font-medium text-slate-700">{fmtPct(pct, 0)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${pctColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

/** Jauge principale de la fiche contrat. */
export function QuotaGauge({
  brousseM3,
  quotaM3,
  girthM3,
  trucksEntered,
  trucksPlanned,
  trucksSawn,
  avgBrousseM3PerTruck,
  estTrucksRemaining,
  estTrucksTotal,
}: {
  brousseM3: string;
  quotaM3: string;
  girthM3: string;
  trucksEntered: number;
  trucksPlanned: number;
  trucksSawn: number;
  /** Projection : moyenne brousse des camions arrivés → camions restants estimés. */
  avgBrousseM3PerTruck?: string;
  estTrucksRemaining?: number | null;
  estTrucksTotal?: number | null;
}) {
  const quota = Number(quotaM3);
  const pct = quota > 0 ? (Number(brousseM3) / quota) * 100 : 0;
  const remaining = Math.max(quota - Number(brousseM3), 0);
  const avg = Number(avgBrousseM3PerTruck ?? 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Utilisation du quota
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {fmtM3(brousseM3)}{" "}
            <span className="text-base font-normal text-slate-400">/ {fmtM3(quotaM3)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-slate-900">{fmtPct(pct, 1)}</div>
          <div className="text-xs text-slate-500">reste {fmtM3(remaining)}</div>
        </div>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${pctColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span>
          Cubage brousse (quota) : <strong className="text-slate-900">{fmtM3(brousseM3)}</strong>
        </span>
        <span>
          Cubage billons (rendement) : <strong className="text-slate-900">{fmtM3(girthM3)}</strong>
        </span>
        <span>
          Camions : <strong className="text-slate-900">{trucksEntered}</strong>
          {trucksPlanned > 0 ? ` / ${trucksPlanned} prévus` : ""} entrés · {trucksSawn} sciés
        </span>
      </div>

      {/* Projection terrain : au rythme des camions déjà mesurés, combien il en
          faut encore pour finir le quota. S'affine à chaque arrivée. */}
      {estTrucksRemaining != null && avg > 0 && remaining > 0 && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          ≈ <strong className="text-slate-900">{estTrucksRemaining}</strong> camion
          {estTrucksRemaining > 1 ? "s" : ""} encore nécessaire
          {estTrucksRemaining > 1 ? "s" : ""} pour finir
          {estTrucksTotal != null && (
            <>
              {" "}
              (<strong className="text-slate-900">≈ {estTrucksTotal}</strong> au total)
            </>
          )}{" "}
          — moyenne {fmtM3(avg)}/camion sur {trucksEntered} arrivé{trucksEntered > 1 ? "s" : ""}
        </div>
      )}
      {estTrucksRemaining != null && remaining === 0 && (
        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Quota atteint — plus aucun camion nécessaire.
        </div>
      )}
    </div>
  );
}
