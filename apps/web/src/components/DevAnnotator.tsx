import { Suspense, lazy } from "react";

// Agentation — barre d'annotation visuelle, DEV UNIQUEMENT.
// On clique un élément de la page, on écrit ce qui cloche, l'annotation
// remonte à l'agent (via le serveur MCP `agentation-mcp`, port 4747) qui
// corrige le code. Rien à voir avec le métier : c'est un outil d'atelier.
//
// Le skill officiel vise Next.js (app/layout.tsx) et le garde derrière
// `process.env.NODE_ENV` ; ici c'est du Vite, donc `import.meta.env.DEV`.
//
// Import dynamique dans une branche `import.meta.env.DEV` : Vite remplace le
// drapeau par `false` au build et Rollup jette la branche entière — le paquet
// ne rentre pas dans le bundle de production, et ne s'exécute jamais devant un
// pointeur du parc.
const Agentation = import.meta.env.DEV
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : null;

export default function DevAnnotator() {
  if (!Agentation) return null;
  // fallback null : la barre est un accessoire, elle n'a pas à faire clignoter
  // la page pendant son chargement.
  return (
    <Suspense fallback={null}>
      <Agentation />
    </Suspense>
  );
}
