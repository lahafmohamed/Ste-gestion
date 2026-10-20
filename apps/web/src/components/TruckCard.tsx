import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount } from "@ste/shared";
import { fmtM3 } from "../lib/format";
import { declaredOf, diaOf, girthOf } from "../lib/trucks";
import Badge from "./ui/Badge";
import { IconCheck, IconChevronRight } from "./icons";

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
    // La carte se soulève au survol (pointeur fin) et le chevron dit « fiche » :
    // l'ancien fondu d'opacité pâlissait justement le texte à lire.
    <div className="rounded-xl bg-white p-3 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
      <Link
        to={`/trucks/${t.id}`}
        className="group -m-1 block rounded-lg p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 active:bg-brand-50"
      >
        {/* Le bordereau en tête : c'est lui qui identifie le voyage. L'immat
            ne dit que le camion, et le même camion revient tous les jours. */}
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-brand-900">
              {t.deliveryNote ? `B/L ${t.deliveryNote}` : "Sans B/L"}
            </span>
            <span className="text-sm text-brand-600">{t.registration}</span>
            {contractCode && <Badge>{contractCode}</Badge>}
            {!dia && !girth && <Badge tone="amber">À étaler</Badge>}
            {dia && !girth && <Badge tone="info">À billonner</Badge>}
          </div>
          <IconChevronRight
            width={18}
            height={18}
            className="mt-0.5 shrink-0 text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </div>

        <div className="mt-2 space-y-1 text-sm">
          <div className="text-brand-600">
            Annoncé : {d.count ?? "—"} billes ·{" "}
            {d.m3 != null ? fmtM3(d.m3) : "— m³"}
            {/* Code parcelle d'un bloc : « 112- » / « 03/05 » se coupait au trait. */}
            {t.parcel && (
              <>
                {" · "}
                <span className="whitespace-nowrap">parcelle {t.parcel}</span>
              </>
            )}
          </div>
          {measured && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-brand-800">
                Étalé : {count} billes · {fmtM3(total!)}
                {girth && ` → ${girth.logs.length} billons`}
              </span>
              {countGap != null && (
                <Badge tone={countGap === 0 ? "parc" : "amber"}>
                  {countGap === 0 ? (
                    <>compte bon<IconCheck width={14} height={14} className="-mr-0.5 ml-1 shrink-0" aria-hidden /></>
                  ) : (
                    `billes ${countGap > 0 ? "+" : ""}${countGap}`
                  )}
                </Badge>
              )}
              {volGap != null && (
                <Badge
                  tone={Math.abs(volGap) / d.m3! <= 0.05 ? "parc" : "amber"}
                  className="tabular-nums"
                >
                  vol {volGap >= 0 ? "+" : ""}
                  {fmtM3(volGap)}
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
