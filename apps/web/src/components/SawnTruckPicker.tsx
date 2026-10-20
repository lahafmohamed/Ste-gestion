import { useState } from "react";
import {
  billParent,
  truckSawnProgress,
  type LogDTO,
  type ProductionRunDTO,
  type TruckDTO,
} from "@ste/shared";
import { truckLabel } from "../lib/trucks";
import Chip from "./ui/Chip";
import { IconCheck } from "./icons";

// Billons d'un camion — c'est le billon qui part au sciage, pas la bille.
export function truckBillons(t: TruckDTO) {
  return t.measurements
    .filter((m) => m.context === "YARD_GIRTH")
    .flatMap((m) => m.logs);
}

// Billons regroupés par bille mère (266A/266B/266C sous « 266 ») — même lecture
// qu'au billonnage, indispensable dès qu'un camion en compte 275.
function billonsByBill(logs: LogDTO[]) {
  const groups = new Map<string, LogDTO[]>();
  for (const l of logs) {
    const key = billParent(l.externalId) ?? "?";
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  return [...groups.entries()].map(([bill, billons]) => ({ bill, billons }));
}

type Props = {
  trucks: TruckDTO[];
  runs: ProductionRunDTO[];
  truckIds: string[];
  logIds: string[];
  onTruckIdsChange: (update: (prev: string[]) => string[]) => void;
  onLogIdsChange: (update: (prev: string[]) => string[]) => void;
};

/**
 * Sélection des camions sciés d'une session, puis de leurs billons (vide =
 * camion entier). Marque les billons déjà passés à la scie via les sessions
 * existantes.
 */
export default function SawnTruckPicker({
  trucks,
  runs,
  truckIds,
  logIds,
  onTruckIdsChange,
  onLogIdsChange,
}: Props) {
  // Avancement existant par camion (sessions déjà enregistrées) : sert à
  // marquer les billons déjà sciés et l'état des camions dans les chips.
  const progressByTruck = new Map(trucks.map((t) => [t.id, truckSawnProgress(t, runs)]));
  // Billon déjà passé à la scie = pas dans « remaining » de son camion.
  const alreadySawnIds = new Set(
    trucks.flatMap((t) => {
      const p = progressByTruck.get(t.id)!;
      if (p.sawn === 0) return [];
      const rem = new Set(p.remaining.map((l) => l.id));
      return truckBillons(t)
        .map((l) => l.id)
        .filter((id) => !rem.has(id));
    })
  );

  function toggleTruck(id: string) {
    onTruckIdsChange((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      // Camion décoché → retirer ses billons de la sélection.
      if (!next.includes(id)) {
        const t = trucks.find((x) => x.id === id);
        if (t) {
          const ids = new Set(truckBillons(t).map((l) => l.id));
          onLogIdsChange((sel) => sel.filter((x) => !ids.has(x)));
        }
      }
      return next;
    });
  }

  function toggleLog(id: string) {
    onLogIdsChange((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const selectedTrucks = trucks.filter((t) => truckIds.includes(t.id));

  // Un contrat accumule les camions : au bout de 27 voyages, les 24 déjà sciés
  // noient les 2 ou 3 qui restent à passer à la scie. On les replie — sans les
  // supprimer, le resciage et les corrections de session en ont besoin. Un
  // camion déjà coché reste visible même replié, sinon la sélection disparaît.
  const [showDone, setShowDone] = useState(false);
  const isDone = (t: TruckDTO) =>
    progressByTruck.get(t.id)!.complete && !truckIds.includes(t.id);
  const doneCount = trucks.filter(isDone).length;
  const visibleTrucks = showDone ? trucks : trucks.filter((t) => !isDone(t));

  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-brand-500">
        Camions sciés (optionnel — définit « sur parc non sciés »)
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleTrucks.map((t) => {
          const p = progressByTruck.get(t.id)!;
          const sel = truckIds.includes(t.id);
          return (
            <Chip
              key={t.id}
              selected={sel}
              onClick={() => toggleTruck(t.id)}
              title={`${t.registration}${t.deliveryNote ? ` · B/L ${t.deliveryNote}` : ""} — ${
                p.total > 0 ? `${p.sawn}/${p.total} billons sciés` : "pas d'étalage billons (girth)"
              }`}
            >
              {/* Le bordereau en tête : c'est lui qui est écrit sur la feuille
                  DEBITE, l'immat ne fait que nommer le camion. */}
              {truckLabel(t)}
              {t.deliveryNote && (
                <span className={`ml-1 font-normal ${sel ? "text-white/70" : "text-brand-500"}`}>
                  {t.registration}
                </span>
              )}
              {p.complete ? (
                <span className={`ml-1 inline-flex items-center gap-0.5 ${sel ? "text-parc-300" : "text-parc-700"}`}>
                  <IconCheck width={14} height={14} className="shrink-0" aria-hidden />
                  fini
                </span>
              ) : p.sawn > 0 ? (
                <span
                  className={`ml-1 tabular-nums ${sel ? "text-amber-300" : "text-amber-600"}`}
                >
                  {p.sawn}/{p.total}
                </span>
              ) : null}
            </Chip>
          );
        })}

        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="min-h-touch rounded-full px-3 text-sm text-brand-500 underline hover:text-brand-900 active:bg-brand-200"
          >
            {showDone
              ? `Masquer les ${doneCount} camions finis`
              : `+ ${doneCount} camion${doneCount > 1 ? "s" : ""} déjà fini${doneCount > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      {/* Tous sciés : sans ce mot, la ligne de chips vide se lit comme un bug. */}
      {visibleTrucks.length === 0 && (
        <p className="mt-1 text-sm text-brand-500">
          Tous les camions du contrat sont sciés — à rouvrir seulement pour un resciage.
        </p>
      )}

      {/* Billons sciés du/des camion(s) coché(s) — vide = camion entier.
          Groupés par bille mère : c'est le billon qui passe à la scie. */}
      {selectedTrucks.map((t) => {
        const billons = truckBillons(t);
        if (billons.length === 0) return null;
        const selCount = billons.filter((l) => logIds.includes(l.id)).length;
        const allSelected = selCount === billons.length;
        const groups = billonsByBill(billons);
        const p = progressByTruck.get(t.id)!;
        return (
          <div key={t.id} className="mt-2 rounded-lg bg-brand-50 p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-brand-500">
              <span>
                Billons sciés de {truckLabel(t)} — {selCount === 0
                  ? "aucun coché = camion entier"
                  : `${selCount}/${billons.length}`}
                {p.sawn > 0 && (
                  <span className="ml-1.5 text-parc-700">
                    · {p.complete ? "tout déjà scié" : `${p.sawn} déjà scié${p.sawn > 1 ? "s" : ""}`}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  onLogIdsChange((p) => {
                    const ids = billons.map((l) => l.id);
                    return allSelected
                      ? p.filter((x) => !ids.includes(x))
                      : [...new Set([...p, ...ids])];
                  })
                }
                className="-my-2 min-h-touch rounded-lg px-2 text-brand-500 underline hover:text-brand-900 active:bg-brand-200"
              >
                {allSelected ? "Tout décocher" : "Tout cocher"}
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {groups.map((g) => {
                const ids = g.billons.map((l) => l.id);
                const selOfBill = ids.filter((id) => logIds.includes(id)).length;
                const allOfBill = selOfBill === ids.length;
                return (
                  <div key={g.bill} className="flex flex-wrap items-center gap-1">
                    {/* Cliquer la bille coche/décoche tous ses billons. */}
                    <button
                      type="button"
                      onClick={() =>
                        onLogIdsChange((p) =>
                          allOfBill
                            ? p.filter((x) => !ids.includes(x))
                            : [...new Set([...p, ...ids])]
                        )
                      }
                      className={`min-h-touch w-14 shrink-0 rounded px-1.5 py-0.5 text-left text-sm font-medium tabular-nums active:bg-brand-200 ${
                        selOfBill > 0 ? "text-parc-700" : "text-brand-500"
                      }`}
                    >
                      {g.bill}
                      <span className="ml-0.5 text-brand-500">·{ids.length}</span>
                    </button>
                    {g.billons.map((l) => {
                      const done = alreadySawnIds.has(l.id);
                      const sel = logIds.includes(l.id);
                      return (
                        <Chip
                          key={l.id}
                          selected={sel}
                          onClick={() => toggleLog(l.id)}
                          // Déjà scié : chip verte + ✓ — recochable (resciage),
                          // mais impossible de le prendre pour du bois restant.
                          className={done && !sel ? "!bg-parc-50 !text-parc-700 !ring-parc-200" : ""}
                          title={`${l.externalId ?? `#${l.position}`} — ${Number(l.volumeM3).toFixed(4)} m³${done ? " — déjà scié" : ""}`}
                        >
                          {/* Suffixe seul (A, B, C…) : la bille est déjà en tête de ligne. */}
                          {l.externalId?.slice(g.bill.length) || l.externalId || `#${l.position}`}
                          {done && <IconCheck width={14} height={14} className="ml-1 shrink-0" aria-hidden />}
                        </Chip>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
