import type { ReactNode } from "react";

// Onglets soulignés d'une fiche (contrat, administration). L'onglet courant vit
// dans l'URL chez l'hôte (partageable, conservé au rechargement) : ce sont des
// liens de navigation dans la page, d'où aria-current et non un tablist.

export type TabItem<K extends string> = { key: K; label: ReactNode };

export default function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  className = "",
}: {
  tabs: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Nom accessible de la rangée (« Sections du contrat »). */
  label: string;
  className?: string;
}) {
  return (
    // overflow-x-auto force aussi overflow-y en auto (règle CSS) : le -mb-px des
    // onglets déborde d'1px et Chrome afficherait une barre verticale fantôme.
    // Barres masquées, le glissement tactile reste possible.
    <nav
      aria-label={label}
      className={`-mx-4 overflow-x-auto border-b border-brand-200 px-4 scrollbar-none${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px min-h-touch whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 ${
                active
                  ? "border-accent-500 text-accent-800"
                  : "border-transparent text-brand-600 hover:border-brand-300 hover:text-brand-900 active:bg-brand-100"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
