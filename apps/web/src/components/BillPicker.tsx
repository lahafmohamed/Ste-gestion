import { useState } from "react";
import { billParent, nextBillonId } from "@ste/shared";
import Button from "./ui/Button";
import Chip from "./ui/Chip";

/** Nb de pastilles de billes affichées avant de replier le sélecteur. */
const BILL_CHIPS = 12;

type Props = {
  /** N° des billes étalées (ordre du parc). */
  bills: string[];
  /** Tous les n° connus du relevé (déjà enregistrés + en cours de saisie). */
  knownIds: string[];
  /** Bille en cours (dernière ligne avec un n°) — « Même bille » enchaîne 266A → 266B. */
  currentBill: string | null;
  /** Billes couvertes par des lignes valides — affiché « x/y billes entamées ». */
  billsTouchedCount: number;
  onAddBillon: (bill: string) => void;
};

/**
 * Sélecteur de bille mère — après nettoyage/tronçonnage, taper la bille crée
 * directement le billon suivant avec son n° (266A, 266B, 266C…).
 */
export default function BillPicker({
  bills,
  knownIds,
  currentBill,
  billsTouchedCount,
  onAddBillon,
}: Props) {
  const [allBills, setAllBills] = useState(false);

  // Nb de billons déjà saisis par bille → badge du sélecteur.
  const billonsPerBill = new Map<string, number>();
  for (const id of knownIds) {
    const p = billParent(id);
    if (p) billonsPerBill.set(p, (billonsPerBill.get(p) ?? 0) + 1);
  }

  // Billes pas encore tronçonnées, dans l'ordre du parc. Repliées par défaut :
  // un camion de 60 billes remplissait l'écran de pastilles.
  const untouchedBills = bills.filter(
    (b) => (billonsPerBill.get(billParent(b) ?? b) ?? 0) === 0
  );
  const nextBill = untouchedBills[0] ?? null;
  const visibleBills = allBills ? bills : untouchedBills.slice(0, BILL_CHIPS);

  return (
    <div className="mb-3 rounded-lg bg-brand-50 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-brand-500">
        <span>
          Bille tronçonnée → nouveau billon ({billsTouchedCount}/{bills.length} billes
          entamées)
        </span>
        {bills.length > BILL_CHIPS && (
          <button
            type="button"
            onClick={() => setAllBills((s) => !s)}
            className="-my-2 min-h-touch shrink-0 rounded-lg px-2 underline hover:text-brand-900 active:bg-brand-200"
          >
            {allBills ? "Réduire" : `Toutes (${bills.length})`}
          </button>
        )}
      </div>

      {/* Le parc se dépile dans l'ordre : la bille suivante à tronçonner
          mérite un bouton pleine largeur, pas d'être cherchée dans 60
          pastilles. Une bille donne souvent plusieurs billons → « Même
          bille » enchaîne 266A → 266B sans rouvrir le sélecteur. */}
      {(nextBill || currentBill) && (
        <div className={`mb-2 grid gap-2 ${nextBill && currentBill ? "grid-cols-2" : ""}`}>
          {currentBill && (
            <Button
              size="lg"
              className="w-full tabular-nums"
              onClick={() => onAddBillon(currentBill)}
            >
              Même bille · {nextBillonId(currentBill, knownIds)}
            </Button>
          )}
          {nextBill && (
            <Button
              variant="parc"
              size="lg"
              className="w-full tabular-nums"
              onClick={() => onAddBillon(nextBill)}
            >
              Bille suivante · {nextBill}
            </Button>
          )}
        </div>
      )}
      {!nextBill && !allBills && (
        <p className="mb-2 text-xs text-brand-500">Toutes les billes sont entamées.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {visibleBills.map((b) => {
          const n = billonsPerBill.get(billParent(b) ?? b) ?? 0;
          return (
            <Chip
              key={b}
              size="lg"
              selected={n > 0}
              className="tabular-nums"
              onClick={() => onAddBillon(b)}
            >
              {b}
              {n > 0 && <span className="ml-1 text-xs opacity-70">×{n}</span>}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
