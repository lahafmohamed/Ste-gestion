import { fmtM3, fmtPct } from "../lib/format";

// Jauge d'utilisation du quota contrat.
// Référence = cubage BROUSSE (mesuré bille par bille à l'état brut, sortie forêt) —
// c'est ce que SODEFOR décompte du quota. Le cubage des BILLONS (girth, mesurés
// après tronçonnage) sert au rendement, pas au quota.

function pctColor(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-parc-500";
}

// Couleur doublée d'un texte : au-delà de 100 %, le pourcentage passe en rouge
// (la barre seule, pleine, ne distingue pas 100 % de 130 %).
function pctText(pct: number): string {
  return pct >= 100 ? "text-red-700" : "text-brand-700";
}

/** Piste de la jauge — rôle progressbar : la valeur se lit aussi au lecteur d'écran. */
export function QuotaTrack({ pct, label, thick = false }: { pct: number; label: string; thick?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(pct, 100))}
      aria-valuetext={fmtPct(pct, 0)}
      className={`${thick ? "h-3" : "h-2"} w-full overflow-hidden rounded-full bg-brand-100`}
    >
      <div
        className={`h-full rounded-full ${pctColor(pct)}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

/** Barre compacte (cartes liste / dashboard). */
export function QuotaBar({ brousseM3, quotaM3 }: { brousseM3: string; quotaM3: string }) {
  const quota = Number(quotaM3);
  const pct = quota > 0 ? (Number(brousseM3) / quota) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm tabular-nums text-brand-500">
        <span className="min-w-0 truncate">
          {fmtM3(brousseM3)} / {quota > 0 ? fmtM3(quotaM3) : "quota non renseigné"}
        </span>
        {quota > 0 && <span className={`font-medium ${pctText(pct)}`}>{fmtPct(pct, 0)}</span>}
      </div>
      <div className="mt-1.5">
        <QuotaTrack pct={pct} label="Utilisation du quota" />
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
  // Dépassement : SODEFOR décompte au-delà du quota, le chiffre doit se voir.
  const over = quota > 0 ? Math.max(Number(brousseM3) - quota, 0) : 0;
  const avg = Number(avgBrousseM3PerTruck ?? 0);
  return (
    <div className="rounded-xl bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-brand-600">Utilisation du quota</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-brand-900">
            {fmtM3(brousseM3)}{" "}
            <span className="text-base font-normal text-brand-500">
              / {quota > 0 ? fmtM3(quotaM3) : "quota non renseigné"}
            </span>
          </div>
        </div>
        {quota > 0 && (
          <div className="text-right tabular-nums">
            <div
              className={`text-2xl font-semibold tracking-tight ${
                pct >= 100 ? "text-red-700" : "text-brand-900"
              }`}
            >
              {fmtPct(pct, 1)}
            </div>
            <div className={`text-xs ${over > 0 ? "font-medium text-red-700" : "text-brand-500"}`}>
              {over > 0 ? `dépassé de ${fmtM3(over)}` : `reste ${fmtM3(remaining)}`}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3">
        <QuotaTrack pct={pct} label="Utilisation du quota" thick />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums text-brand-500">
        <span>
          Cubage brousse (quota) : <strong className="text-brand-900">{fmtM3(brousseM3)}</strong>
        </span>
        <span>
          Cubage billons (rendement) : <strong className="text-brand-900">{fmtM3(girthM3)}</strong>
        </span>
        <span>
          Camions : <strong className="text-brand-900">{trucksEntered}</strong> entré
          {trucksEntered > 1 ? "s" : ""}
          {trucksPlanned > 0 ? ` sur ${trucksPlanned} prévus` : ""} · {trucksSawn} scié
          {trucksSawn > 1 ? "s" : ""}
        </span>
      </div>

      {/* Projection terrain : au rythme des camions déjà mesurés, combien il en
          faut encore pour finir le quota. S'affine à chaque arrivée. */}
      {estTrucksRemaining != null && avg > 0 && remaining > 0 && (
        <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm tabular-nums text-brand-600">
          {/* Arrondi au plus proche côté API : 0 = le reste tient dans moins
              d'un demi-camion moyen, pas « aucun camion ». */}
          {estTrucksRemaining > 0 ? (
            <>
              ≈ <strong className="text-brand-900">{estTrucksRemaining}</strong> camion
              {estTrucksRemaining > 1 ? "s" : ""} encore nécessaire
              {estTrucksRemaining > 1 ? "s" : ""} pour finir
            </>
          ) : (
            <>
              <strong className="text-brand-900">Moins d'un camion</strong> pour finir
            </>
          )}
          {estTrucksTotal != null && (
            <>
              {" "}
              (<strong className="text-brand-900">≈ {estTrucksTotal}</strong> au total)
            </>
          )}{" "}
          — moyenne {fmtM3(avg)}/camion sur {trucksEntered} arrivé{trucksEntered > 1 ? "s" : ""}
        </div>
      )}
      {quota > 0 && remaining === 0 && (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            over > 0 ? "bg-red-50 text-red-800" : "bg-parc-50 text-parc-800"
          }`}
        >
          {over > 0
            ? `Quota dépassé de ${fmtM3(over)} sur le cubage brousse.`
            : "Quota atteint — plus aucun camion nécessaire."}
        </div>
      )}
    </div>
  );
}
