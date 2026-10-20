import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  future: {
    // `hover:` seulement là où un vrai pointeur survole (souris, trackpad).
    // Au doigt, un tap laissait l'état de survol collé sur la carte ou le
    // bouton touché — sur la tablette du parc, c'est tout le temps.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      screens: {
        // Téléphone en paysage (~360px de haut) : le chrome vertical (header,
        // paddings) se compacte pour laisser la place à la saisie.
        short: { raw: "(max-height: 480px)" },
      },
      fontFamily: {
        // Inter (variable, auto-hébergée via @fontsource — l'app tourne hors
        // ligne au parc, pas de Google Fonts). Segoe/Roboto en secours.
        sans: [
          "'Inter Variable'",
          "Inter",
          "system-ui",
          "-apple-system",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
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
        // Fond de page : papier chaud, un cran sous brand-50 pour que les
        // cartes blanches se détachent par l'ombre et non par une bordure.
        ground: "#F5F3F0",
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
      boxShadow: {
        // Élévation par ombres transparentes (pas de bordure pleine) : un
        // anneau 1px très léger tient lieu de contour, puis une ombre de
        // portée courte. Les surfaces gardent leur relief sur tout fond.
        card:
          "0 0 0 1px oklch(0.3 0.02 55 / 0.07), 0 1px 2px 0 oklch(0.3 0.02 55 / 0.05), 0 2px 6px -2px oklch(0.3 0.02 55 / 0.08)",
        "card-hover":
          "0 0 0 1px oklch(0.3 0.02 55 / 0.1), 0 2px 4px 0 oklch(0.3 0.02 55 / 0.06), 0 8px 20px -6px oklch(0.3 0.02 55 / 0.14)",
        // Bouton plein : liseré clair en haut (relief) + ombre courte.
        btn: "inset 0 1px 0 0 oklch(1 0 0 / 0.14), 0 1px 2px 0 oklch(0 0 0 / 0.12)",
        // Calque flottant (calendrier, menus) : anneau + deux ombres de portée.
        popover:
          "0 0 0 1px oklch(0.3 0.02 55 / 0.08), 0 4px 8px -2px oklch(0.3 0.02 55 / 0.1), 0 12px 24px -6px oklch(0.3 0.02 55 / 0.12)",
        // Boîte de dialogue : portée longue, le fond est voilé derrière.
        dialog:
          "0 0 0 1px oklch(0.3 0.02 55 / 0.08), 0 8px 16px -4px oklch(0.3 0.02 55 / 0.12), 0 24px 48px -12px oklch(0.3 0.02 55 / 0.2)",
        // En-tête fixe : trait bas très léger, sans bordure dure.
        header: "0 1px 0 0 oklch(0.3 0.02 55 / 0.08), 0 1px 8px 0 oklch(0.3 0.02 55 / 0.04)",
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
      keyframes: {
        // Entrée de carte (login…) : fondu + légère montée.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Calque flottant (menu, dialogue) : fondu + léger zoom depuis 0.96.
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(-4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Secousse horizontale d'erreur de formulaire.
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "75%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        // Toujours utiliser via motion-safe: (prefers-reduced-motion).
        "rise-in": "rise-in 0.3s ease-out both",
        "pop-in": "pop-in 0.15s cubic-bezier(0.2, 0, 0, 1) both",
        "fade-in": "fade-in 0.2s ease-out both",
        shake: "shake 0.25s ease-in-out",
      },
    },
  },
  plugins: [],
};
