// Blocs de chargement — remplacent le « Chargement… » texte : la page garde sa
// forme pendant la requête au lieu de sauter quand les données arrivent.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div className={`h-4 animate-pulse rounded bg-slate-100${className ? ` ${className}` : ""}`} />
  );
}

/** Carte fantôme (liste de camions, contrats…). */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <SkeletonLine className="w-1/3" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} className={i % 2 ? "w-1/2" : "w-3/4"} />
        ))}
      </div>
    </div>
  );
}

/** Liste de cartes fantômes — l'attente par défaut des pages à liste. */
export function SkeletonList({ count = 3, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}
