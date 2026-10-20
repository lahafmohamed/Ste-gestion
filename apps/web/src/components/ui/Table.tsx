import type { ReactNode } from "react";

// Enveloppe standard des tableaux : défilement horizontal + ombres de bord
// (le tableau coupé signale qu'il continue), et au choix la première colonne
// figée — pour les larges tableaux de comparaison (Analyse par camion), sinon
// on scrolle à l'aveugle sans savoir quelle ligne on lit.

// En-tête figé sous le header de l'app pendant qu'on descend la page.
// `overflow-x: auto` fabrique un conteneur de défilement (overflow-y passe à
// auto avec lui) : `sticky` s'y accrocherait au haut du tableau, qui défile
// avec la page — donc rien ne colle. À partir de lg, là où le tableau tient
// dans la colonne, on rend le débordement visible et l'en-tête s'accroche au
// viewport ; en dessous, le défilement horizontal reste prioritaire.
const STICKY_HEAD =
  " lg:overflow-x-visible lg:[&_thead_th]:sticky lg:[&_thead_th]:top-header " +
  "short:lg:[&_thead_th]:top-header-sm lg:[&_thead_th]:z-10 lg:[&_thead_th]:bg-white " +
  "lg:[&_thead_th]:border-b lg:[&_thead_th]:border-brand-200";

const STICKY_FIRST =
  " [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-white " +
  "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-white";

export function TableWrap({
  children,
  stickyFirstCol = false,
  stickyHeader = false,
  className = "",
}: {
  children: ReactNode;
  /** Fige la 1re colonne pendant le défilement horizontal. */
  stickyFirstCol?: boolean;
  /** Fige la ligne d'en-tête sous le header de l'app (à partir de lg). */
  stickyHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-x-auto scroll-shadow-x${stickyFirstCol ? STICKY_FIRST : ""}${
        stickyHeader ? STICKY_HEAD : ""
      }${className ? ` ${className}` : ""}`}
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
  colSpan,
  className = "",
}: {
  children?: ReactNode;
  num?: boolean;
  /** Fusion de colonnes (ligne de total d'un pied de tableau). */
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`py-1 pr-3${num ? " text-right tabular-nums" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </td>
  );
}
