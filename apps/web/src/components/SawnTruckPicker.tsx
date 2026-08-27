import {
  billParent,
  truckSawnProgress,
  type LogDTO,
  type ProductionRunDTO,
  type TruckDTO,
} from "@ste/shared";
import Chip from "./ui/Chip";

// Cubage des billons (girth) d'un camion — dénominateur du rendement.
export function truckGirthM3(t: TruckDTO): number {
  return t.measurements
    .filter((m) => m.context === "YARD_GIRTH")
    .reduce((s, m) => s + m.logs.reduce((x, l) => x + Number(l.volumeM3), 0), 0);
}

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

  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-brand-500">
        Camions sciés (optionnel — définit « sur parc non sciés »)
      </div>
      <div className="flex flex-wrap gap-2">
        {trucks.map((t) => {
          const p = progressByTruck.get(t.id)!;
          const sel = truckIds.includes(t.id);
          return (
            <Chip
              key={t.id}
              selected={sel}
              onClick={() => toggleTruck(t.id)}
              title={
                p.total > 0
                  ? `${p.sawn}/${p.total} billons sciés`
                  : "Pas d'étalage billons (girth)"
              }
            >
              {t.registration}
              {p.complete ? (
                <span className={`ml-1 ${sel ? "text-parc-300" : "text-parc-700"}`}>
                  ✓ fini
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
      </div>

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
                Billons sciés de {t.registration} — {selCount === 0
                  ? "aucun coché = camion entier"
                  : `${selCount}/${billons.length}`}
                {p.sawn > 0 && (
                  <span className="ml-1.5 text-parc-700">
                    · {p.complete ? "tout déjà scié" : `${p.sawn} déjà scié${p.sawn > 1 ? "s" : ""} ✓`}
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
                      <span className="ml-0.5 text-brand-400">·{ids.length}</span>
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
                          {done ? " ✓" : ""}
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
