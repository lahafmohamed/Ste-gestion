import type { ReactNode } from "react";

// Enveloppe standard des tableaux : défilement horizontal + ombres de bord
// (le tableau coupé signale qu'il continue), et au choix la première colonne
// figée — pour les larges tableaux de comparaison (Analyse par camion), sinon
// on scrolle à l'aveugle sans savoir quelle ligne on lit.

const STICKY_FIRST =
  " [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-white " +
  "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-white";

export function TableWrap({
  children,
  stickyFirstCol = false,
  className = "",
}: {
  children: ReactNode;
  /** Fige la 1re colonne pendant le défilement horizontal. */
  stickyFirstCol?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-x-auto scroll-shadow-x${stickyFirstCol ? STICKY_FIRST : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * Sort de la colonne de contenu (`max-w-page`, 48rem) à partir de lg, pour les
 * tableaux trop larges pour elle : sur un grand écran la place existe, autant
 * afficher les colonnes plutôt que de les faire défiler.
 * Le shell desktop réserve 14rem de barre latérale (+ marges + barre de
 * défilement) : on ne prend que le reste, jamais 100vw.
 */
export function WideBleed({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`lg:relative lg:left-1/2 lg:w-[calc(100vw-17rem)] lg:-translate-x-1/2${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

/** Cellule d'en-tête standard (libellé gris non gras). */
export function Th({
  children,
  right = false,
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`py-1 pr-3 font-normal${right ? " text-right" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </th>
  );
}

/** Cellule standard ; `num` = alignée à droite en chiffres tabulaires. */
export function Td({
  children,
  num = false,
  className = "",
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`py-1 pr-3${num ? " text-right tabular-nums" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </td>
  );
}
