import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Alias sémantiques — mêmes teintes qu'aujourd'hui (aucun changement
        // visuel) : brand = chrome de l'app (slate), parc = chaîne du parc
        // (emerald : étaler, billonner, bille suivante…).
        brand: colors.slate,
        parc: colors.emerald,
      },
      minHeight: {
        // Planchers tactiles : touch = 44px (saisie, nav), touch-lg = 48px
        // (boutons de validation tablette au parc).
        touch: "2.75rem",
        "touch-lg": "3rem",
      },
      maxWidth: {
        // Colonne de contenu standard (l'actuel max-w-3xl répété partout).
        page: "48rem",
      },
      spacing: {
        // Hauteur du header fixe — sert à h-*, pt-*, top-* et scroll-mt-*.
        header: "3.5rem",
      },
      zIndex: {
        header: "20",
        overlay: "40",
      },
    },
  },
  plugins: [],
};
