import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        // Téléphone en paysage (~360px de haut) : le chrome vertical (header,
        // paddings) se compacte pour laisser la place à la saisie.
        short: { raw: "(max-height: 480px)" },
      },
      fontSize: {
        // Titres fluides : lisibles sur téléphone sans manger l'écran, plus
        // grands dès que la largeur le permet.
        title: ["clamp(1.375rem, 1.05rem + 1.6vw, 1.5rem)", { lineHeight: "1.3" }],
        "title-sm": ["clamp(1.125rem, 1rem + 0.6vw, 1.25rem)", { lineHeight: "1.4" }],
      },
      colors: {
        // Palette « Atelier » alignée sur le logo STE :
        //  - brand  = chrome de l'app, gris chaud (stone).
        //  - accent = brun teck du logo (#856656) — actions primaires, nav
        //    active, jauges débitage. Le 500 tient AA sur blanc (5,2:1).
        //  - parc   = vert sève du logo (#8BC63E) — chaîne du parc (étaler,
        //    billonner…). Jaune-vert : texte/boutons à partir du 700 (AA),
        //    le 500 reste pour aplats et jauges.
        brand: colors.stone,
        accent: {
          50: "#FAF8F6",
          100: "#F1ECE7",
          200: "#E2D8D0",
          300: "#CCBCB0",
          400: "#AC917F",
          500: "#856656",
          600: "#745849",
          700: "#60483C",
          800: "#503C32",
          900: "#423229",
          950: "#2A1F19",
        },
        parc: {
          50: "#F5FAEB",
          100: "#E8F5D2",
          200: "#D2EBA8",
          300: "#B4DD75",
          400: "#9CD150",
          500: "#8BC63E",
          600: "#74A82C",
          700: "#587F22",
          800: "#47651F",
          900: "#3C551E",
          950: "#1E2D0C",
        },
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
        // Colonne large : pages de consultation (contrats, stock, empotage…).
        // 48rem reste la règle pour la saisie ; 72rem évite le vide latéral
        // sur desktop quand la page est faite de tables et de cartes.
        "page-wide": "72rem",
      },
      spacing: {
        // Hauteur du header fixe — sert à h-*, pt-*, top-* et scroll-mt-*.
        header: "3.5rem",
        // Variante compacte (téléphone en paysage, breakpoint `short`).
        "header-sm": "3rem",
      },
      zIndex: {
        header: "20",
        overlay: "40",
      },
    },
  },
  plugins: [],
};
