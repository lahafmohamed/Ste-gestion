import type { ReactNode } from "react";
import { IconAlert, IconCheck, IconInfo, type IconProps } from "../icons";

/**
 * Liste vide : un emplacement visible (encadré pointillé) plutôt qu'une ligne
 * grise perdue sur le fond — on voit que la place existe ; `action` dit
 * comment la remplir.
 */
export function EmptyState({ action, children }: { action?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-dashed border-brand-300 px-4 text-center ${
        action ? "py-8" : "py-5"
      }`}
    >
      <p className="text-pretty text-sm text-brand-600">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Échec de chargement (query) — sans lui, une liste en erreur ressemble à une liste vide. */
export function QueryError({
  error,
  onRetry,
  children,
}: {
  error?: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 ring-1 ring-inset ring-red-200">
      <IconAlert width={20} height={20} className="mt-px shrink-0 text-red-600" />
      <div className="min-w-0">
        <p className="text-pretty text-sm text-red-800">
          {children}
          {error instanceof Error ? ` : ${error.message}` : "."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-touch rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 active:bg-red-200"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

const NOTICE_TONE = {
  // Information d'état (contrat clôturé, rappel de règle) : ton neutre.
  neutral: { box: "bg-brand-100 text-brand-700", icon: "text-brand-500", Icon: IconInfo },
  // Écart, doublon, dépassement : non bloquant, mais à regarder.
  warn: {
    box: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200/80",
    icon: "text-amber-600",
    Icon: IconAlert,
  },
  danger: {
    box: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200/80",
    icon: "text-red-600",
    Icon: IconAlert,
  },
  success: {
    box: "bg-parc-50 text-parc-900 ring-1 ring-inset ring-parc-200/80",
    icon: "text-parc-700",
    Icon: IconCheck,
  },
} as const;

/**
 * Bandeau d'information dans le fil de la page (contrat clôturé, B/L en double,
 * stock négatif…). L'icône double la couleur : le ton se lit sans elle.
 */
export function Notice({
  tone = "neutral",
  icon: Icon,
  children,
  className = "",
}: {
  tone?: keyof typeof NOTICE_TONE;
  /** Icône à la place de celle du ton (ex. IconLock pour « lecture seule »). */
  icon?: (p: IconProps) => JSX.Element;
  children: ReactNode;
  className?: string;
}) {
  const t = NOTICE_TONE[tone];
  const Glyph = Icon ?? t.Icon;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm ${t.box}${
        className ? ` ${className}` : ""
      }`}
    >
      <Glyph width={18} height={18} className={`mt-px shrink-0 ${t.icon}`} />
      <div className="min-w-0 text-pretty">{children}</div>
    </div>
  );
}

/** Échec d'enregistrement (mutation), affiché près du bouton qui a échoué. */
export function FormError({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200/70">
      <IconAlert width={16} height={16} className="mt-0.5 shrink-0 text-red-600" />
      <div className="min-w-0 text-pretty">
        {children}
        {hint && <div className="mt-0.5 text-xs text-red-700">{hint}</div>}
      </div>
    </div>
  );
}
