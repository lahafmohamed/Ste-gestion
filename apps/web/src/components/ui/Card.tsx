import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

// Conteneurs de page unifiés : carte blanche, titre de section, tuile KPI,
// lien retour — les quatre motifs recopiés sur toutes les pages.

const PAD = {
  none: "",
  sm: " p-3",
  md: " p-4",
} as const;

type CardProps = HTMLAttributes<HTMLDivElement> & { pad?: keyof typeof PAD };

export default function Card({ pad = "md", className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-brand-200 bg-white${PAD[pad]}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

/** Titre de section (uppercase gris) + emplacement d'action à droite. */
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
      className={`mb-2 flex items-center justify-between gap-2${className ? ` ${className}` : ""}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-400">
        {children}
      </h2>
      {right}
    </div>
  );
}

/** Tuile chiffre-clé (libellé + valeur). */
export function Kpi({
  label,
  value,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-brand-200 bg-white p-3${className ? ` ${className}` : ""}`}
    >
      <div className="text-xs text-brand-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-brand-900">{value}</div>
    </div>
  );
}

/** Lien retour en haut de fiche — zone de tap élargie, se vise au pouce. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-mx-2 inline-flex min-h-touch items-center rounded-lg px-2 text-sm text-brand-500 hover:text-brand-900 active:bg-brand-100"
    >
      ← {children}
    </Link>
  );
}
