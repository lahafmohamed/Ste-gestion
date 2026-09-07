import type { SVGProps } from "react";

// Icônes ligne (stroke = currentColor), 24×24, inline (aucune dépendance).
function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={20}
      height={20}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export type IconProps = SVGProps<SVGSVGElement>;

// Jauge de quota — ce que le tableau de bord montre vraiment : combien du
// quota SODEFOR est consommé. La grille « bento » générique n'en disait rien.
export const IconDashboard = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 17.5a8.5 8.5 0 0 1 17 0" />
    <path d="M12 17.5l4.5-4.5" />
    <circle cx="12" cy="17.5" r="1.25" />
  </Base>
);

// Document + tampon : un contrat SODEFOR ne vaut que tamponné, et le cachet
// distingue l'icône des autres papiers du jeu (Rapport, Comptabilité).
export const IconContract = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 9h1M9 12.5h6" />
    <circle cx="14" cy="16.5" r="2.5" />
  </Base>
);

export const IconTruck = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 5h11v11H2z" />
    <path d="M13 8h4l4 4v4h-8" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Base>
);

// Camion vu de face — le parc (référentiel), là où IconTruck (de profil) est
// l'arrivée d'un camion au portail.
export const IconFleet = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h12a1 1 0 0 1 1 1v4H5V4a1 1 0 0 1 1-1Z" />
    <rect x="3" y="8" width="18" height="8" rx="1.5" />
    <path d="M7 12h2M15 12h2" />
    <path d="M6 16v2M18 16v2" />
  </Base>
);

// Billes étalées au parc, vues en bout (cœur + écorce).
export const IconLogs = (p: IconProps) => (
  <Base {...p}>
    <circle cx="7.5" cy="8" r="3.5" />
    <circle cx="16.5" cy="8" r="3.5" />
    <circle cx="12" cy="15.5" r="3.5" />
    <circle cx="7.5" cy="8" r="1" />
    <circle cx="16.5" cy="8" r="1" />
    <circle cx="12" cy="15.5" r="1" />
  </Base>
);

// Ruban de scie + billon vu en bout (même vocabulaire que IconLogs : cercle
// + cœur). L'ancien dessin était une scie à main, pas une scierie.
export const IconSaw = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="12" r="5.5" />
    <circle cx="8" cy="12" r="1" />
    <path d="M17.5 3v18" />
    <path d="M17.5 6l2 1.5-2 1.5M17.5 12l2 1.5-2 1.5" />
  </Base>
);

// Pile d'avivés — le stock est du bois débité, empilé. Largeurs inégales pour
// que trois barres ne se lisent pas comme un menu.
export const IconBox = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4.5" width="16" height="4" rx="1" />
    <rect x="2.5" y="10" width="19" height="4" rx="1" />
    <rect x="6" y="15.5" width="12" height="4" rx="1" />
  </Base>
);

export const IconSales = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8" />
    <circle cx="12" cy="11" r="2.5" />
    <path d="M17 15h5M19.5 12.5v5" />
  </Base>
);

export const IconContainer = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="7" width="18" height="10" rx="1" />
    <path d="M7 7v10M12 7v10M17 7v10" />
    <path d="M3 20h18" />
  </Base>
);

export const IconReport = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M7 7H5M7 12H5M7 17H5" />
    <path d="M10 8h4M10 12h4M10 16h2" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14.5c2.5.3 4 1.8 4 4" />
  </Base>
);

export const IconLogout = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Base>
);

// Feuille qui entre dans un bac : un classeur Excel qui rejoint l'app.
export const IconImport = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v11" />
    <path d="M8 10l4 4 4-4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Base>
);

export const IconLedger = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h11a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" />
    <path d="M9 8h6M9 12h6" />
  </Base>
);
