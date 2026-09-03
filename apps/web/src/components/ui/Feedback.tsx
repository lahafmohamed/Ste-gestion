import type { ReactNode } from "react";

/** Liste vide. Avec `action` : encadré pointillé + bouton ; sans : simple ligne grise. */
export function EmptyState({ action, children }: { action?: ReactNode; children: ReactNode }) {
  if (!action) return <p className="text-sm text-brand-500">{children}</p>;
  return (
    <div className="rounded-xl border border-dashed border-brand-300 px-6 py-8 text-center">
      <p className="text-sm text-brand-500">{children}</p>
      <div className="mt-4">{action}</div>
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
    <div className="rounded-xl bg-red-50 p-4 ring-1 ring-inset ring-red-200">
      <p className="text-sm text-red-700">
        {children}
        {error instanceof Error ? ` : ${error.message}` : "."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 min-h-touch rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 active:bg-red-200"
      >
        Réessayer
      </button>
    </div>
  );
}

/** Échec d'enregistrement (mutation), affiché près du bouton qui a échoué. */
export function FormError({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200/70">
      {children}
      {hint && <div className="mt-0.5 text-xs text-red-600">{hint}</div>}
    </div>
  );
}
