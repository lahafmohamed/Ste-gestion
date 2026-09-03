import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "parc" | "danger" | "ghost-danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

// :active : retour d'appui tactile — le hover n'existe pas au doigt (le
// tap-highlight iOS est désactivé globalement, voir index.css). Le léger
// rétrécissement (scale 0.96) donne la sensation d'un bouton qui s'enfonce.
const VARIANT: Record<ButtonVariant, string> = {
  // primary = brun teck du logo (accent) — l'identité vit dans les actions.
  primary: "bg-accent-500 text-white shadow-btn hover:bg-accent-600 active:bg-accent-700",
  secondary:
    "bg-white text-brand-800 shadow-card hover:bg-brand-50 hover:shadow-card-hover active:bg-brand-100 active:shadow-card",
  // Réservé aux actions de la chaîne parc (étaler, billonner, bille suivante).
  // Base -700 : le vert sève est jaune-vert, en dessous le texte blanc n'est
  // plus lisible (AA).
  parc: "bg-parc-700 text-white shadow-btn hover:bg-parc-800 active:bg-parc-900",
  danger: "bg-red-600 text-white shadow-btn hover:bg-red-700 active:bg-red-800",
  // Action destructrice secondaire (« Supprimer » discret des fiches) : gris
  // au repos, ne devient rouge qu'à l'intention.
  "ghost-danger": "text-brand-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100",
};

// lg : saisie tablette — 16px (pas de zoom auto iOS) et grande cible tactile.
// min-h : plancher tactile 44px partout (l'app se pilote au pouce sur le
// terrain), 48px pour les validations lg.
const SIZE: Record<ButtonSize, string> = {
  xs: "min-h-touch px-3 py-1.5 text-sm",
  sm: "min-h-touch px-3 py-1.5 text-sm",
  md: "min-h-touch px-4 py-2 text-sm",
  lg: "min-h-touch-lg px-5 py-3 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-[background-color,box-shadow,transform,color] duration-150 ease-out " +
  "active:scale-[0.96] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 " +
  "disabled:pointer-events-none disabled:opacity-50";

/** Classes seules — pour styler un <Link> en bouton. */
export function buttonCls(variant: ButtonVariant, size: ButtonSize, extra = ""): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}${extra ? ` ${extra}` : ""}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    // type explicite : un bouton nu dans un <form> soumettrait le formulaire.
    type = "button",
    className = "",
    ...rest
  },
  ref
) {
  return (
    <button ref={ref} type={type} className={buttonCls(variant, size, className)} {...rest} />
  );
});

export default Button;
