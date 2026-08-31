import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount } from "@ste/shared";
import { fmtM3, fmtNum } from "../lib/format";
import { declaredOf, diaOf, girthOf } from "../lib/trucks";
import Badge from "./ui/Badge";

/**
 * Carte camion partagée par la Réception et l'Étalage : annoncé (bordereau) vs
 * étalé / billonné, écarts en un coup d'œil. `action` = bouton de l'étape
 * suivante, rendu hors du lien vers la fiche.
 */
export default function TruckCard({
  truck: t,
  action,
  contractCode,
}: {
  truck: TruckDTO;
  action?: ReactNode;
  /** Renseigné seulement dans les vues multi-contrats (réception « tous »). */
  contractCode?: string;
}) {
  const dia = diaOf(t);
  const girth = girthOf(t);
  const d = declaredOf(t);
  // Volume parc de référence = étalage des billes (Ø) ; à défaut le girth.
  const measured = dia ?? girth;
  const total = measured ? measurementTotalM3(measured) : null;
  // Billes réelles : le girth compte des billons, regroupés par bille mère.
  const count = truckBillCount(t);
  const countGap = d.count != null && count != null ? count - d.count : null;
  const volGap = d.m3 != null && d.m3 > 0 && total != null ? total - d.m3 : null;

  return (
    <div className="rounded-xl border border-brand-200 bg-white p-3">
      <Link
        to={`/trucks/${t.id}`}
        className="block transition-opacity hover:opacity-80 active:opacity-60"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-brand-900">{t.registration}</span>
            {contractCode && <Badge>{contractCode}</Badge>}
            {!dia && !girth && <Badge tone="amber">À étaler</Badge>}
            {dia && !girth && <Badge tone="info">À billonner</Badge>}
          </div>
          <div className="shrink-0 text-sm text-brand-500">
            {t.deliveryNote ? `B/L ${t.deliveryNote}` : ""}
          </div>
        </div>

        <div className="mt-2 space-y-1 text-sm">
          <div className="text-brand-500">
            Annoncé : {d.count ?? "—"} billes ·{" "}
            {d.m3 != null ? `${fmtNum(d.m3.toFixed(3))} m³` : "— m³"}
            {t.parcel ? ` · parcelle ${t.parcel}` : ""}
          </div>
          {measured && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-brand-700">
                Étalé : {count} billes · {fmtM3(total!)}
                {girth && ` → ${girth.logs.length} billons`}
              </span>
              {countGap != null && (
                <Badge tone={countGap === 0 ? "parc" : "amber"}>
                  {countGap === 0 ? "compte bon ✓" : `billes ${countGap > 0 ? "+" : ""}${countGap}`}
                </Badge>
              )}
              {volGap != null && (
                <Badge
                  tone={Math.abs(volGap) / d.m3! <= 0.05 ? "parc" : "amber"}
                  className="tabular-nums"
                >
                  vol {volGap >= 0 ? "+" : ""}
                  {fmtNum(volGap.toFixed(3))} m³
                </Badge>
              )}
            </div>
          )}
        </div>
      </Link>

      {action}
    </div>
  );
}
