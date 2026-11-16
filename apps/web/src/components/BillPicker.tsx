import { useState } from "react";
import { billParent, nextBillonId } from "@ste/shared";
import Button from "./ui/Button";
import Chip from "./ui/Chip";
import { IconCheck } from "./icons";

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
    // Anneau léger : le sélecteur reste lisible posé sur un fond brand-50
    // (ajout de billons depuis la fiche camion), pas seulement sur blanc.
    <div className="mb-3 rounded-xl bg-brand-50 p-2.5 ring-1 ring-inset ring-brand-100">
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* Avancement en tête (chiffre lisible debout), mode d'emploi à la suite. */}
        <p className="min-w-0 text-pretty text-sm text-brand-600">
          <span className="font-semibold tabular-nums text-brand-900">
            {billsTouchedCount}/{bills.length}
          </span>{" "}
          billes entamées · taper une bille ajoute son billon suivant
        </p>
        {bills.length > BILL_CHIPS && (
          <button
            type="button"
            aria-expanded={allBills}
            onClick={() => setAllBills((s) => !s)}
            className="-my-2 inline-flex min-h-touch shrink-0 items-center rounded-lg px-2 text-sm font-medium text-brand-600 underline transition-colors hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-200"
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
        <p className="mb-2 flex items-center gap-1.5 text-sm text-parc-700">
          <IconCheck width={16} height={16} className="shrink-0" aria-hidden />
          Toutes les billes sont entamées.
        </p>
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
              // Le compteur seul (« 2 ») ne dit rien au lecteur d'écran.
              aria-label={`Bille ${b}${
                n > 0 ? `, ${n} billon${n > 1 ? "s" : ""}` : ""
              } : ajouter un billon`}
              onClick={() => onAddBillon(b)}
            >
              {b}
              {/* Pastille de compte plutôt qu'un « ×2 » : se lit d'un coup d'œil
                  sur la puce sombre (sélectionnée). */}
              {n > 0 && (
                <span
                  aria-hidden="true"
                  className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-semibold"
                >
                  {n}
                </span>
              )}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
