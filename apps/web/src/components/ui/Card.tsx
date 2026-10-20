import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

// Conteneurs de page unifiés : carte blanche, titre de section, tuile KPI,
// lien retour — les quatre motifs recopiés sur toutes les pages.
//
// Relief par ombre (shadow-card), pas par bordure : l'anneau 1px translucide
// tient lieu de contour et la carte se détache du fond papier (ground) sans
// trait dur. Les bordures restent réservées à la structure (séparateurs,
// états sélectionnés).

const PAD = {
  none: "",
  sm: " p-3",
  md: " p-4",
  lg: " p-5",
} as const;

/** Classes de base d'une carte — pour les éléments qui ne sont pas un <div>. */
export const cardCls = "rounded-xl bg-white shadow-card";

/** Carte cliquable (lien vers une fiche) : se soulève au survol, s'enfonce au tap. */
export const cardInteractiveCls =
  `${cardCls} transition-[box-shadow,transform] duration-200 ease-out ` +
  "hover:shadow-card-hover motion-safe:active:scale-[0.99] active:shadow-card " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

type CardProps = HTMLAttributes<HTMLDivElement> & { pad?: keyof typeof PAD };

export default function Card({ pad = "md", className = "", ...rest }: CardProps) {
  return (
    <div className={`${cardCls}${PAD[pad]}${className ? ` ${className}` : ""}`} {...rest} />
  );
}

/** Titre de section (phrase courte, encre pleine) + emplacement d'action à droite. */
export function SectionHeading({
  children,
  right,
  className = "",
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1${
        className ? ` ${className}` : ""
      }`}
    >
      <h2 className="text-base font-semibold tracking-tight text-brand-900">{children}</h2>
      {right}
    </div>
  );
}

/** Tuile chiffre-clé (libellé + valeur, précision facultative sous la valeur). */
export function Kpi({
  label,
  value,
  hint,
  tone = "default",
  inset = false,
  bare = false,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** Ligne secondaire (variation, référence) sous la valeur. */
  hint?: ReactNode;
  /** parc : valeur en vert sève (chaîne du parc) ; accent : teck. */
  tone?: "default" | "parc" | "accent";
  /** Tuile posée DANS une carte : aplat clair sans ombre (pas de relief empilé). */
  inset?: boolean;
  /** Cellule d'une KpiStrip : fond blanc seul, la bande porte le relief. */
  bare?: boolean;
  className?: string;
}) {
  const valueTone =
    tone === "parc" ? "text-parc-700" : tone === "accent" ? "text-accent-600" : "text-brand-900";
  const surface = bare
    ? "bg-white"
    : inset
      ? "rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-100"
      : cardCls;
  return (
    <div className={`${surface} px-4 py-3.5${className ? ` ${className}` : ""}`}>
      <div className="text-sm text-brand-600">{label}</div>
      <div className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-brand-500">{hint}</div>}
    </div>
  );
}

/**
 * Bande de chiffres-clés : une seule surface découpée en cellules par un filet
 * d'1px (le fond de la grille passe entre les cellules), au lieu de trois ou
 * quatre cartes identiques côte à côte. Enfants : des <Kpi bare />.
 * Téléphone : deux colonnes ; une cellule seule en dernière ligne s'étale sur
 * les deux plutôt que de laisser un trou.
 */
export function KpiStrip({
  children,
  cols = 4,
  className = "",
}: {
  children: ReactNode;
  /** Colonnes à partir de la tablette (3 ou 4 chiffres). */
  cols?: 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-brand-100 shadow-card [&>:last-child:nth-child(odd)]:col-span-2 ${
        cols === 3
          ? "sm:grid-cols-3 sm:[&>:last-child:nth-child(odd)]:col-span-1"
          : "md:grid-cols-4 md:[&>:last-child:nth-child(odd)]:col-span-1"
      }${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

/** Lien retour en haut de fiche — zone de tap élargie, se vise au pouce. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group -mx-2 inline-flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-500 transition-colors hover:text-brand-900 active:bg-brand-100"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 transition-transform duration-150 ease-out group-hover:-translate-x-0.5"
        aria-hidden
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {children}
    </Link>
  );
}
