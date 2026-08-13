import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "emerald" | "danger" | "ghost-danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

// :active : retour d'appui tactile — le hover n'existe pas au doigt (le
// tap-highlight iOS est désactivé globalement, voir index.css).
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-600",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:border-slate-900 active:bg-slate-100",
  // Réservé aux actions de la chaîne parc (étaler, billonner, bille suivante).
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  // Action destructrice secondaire (« Supprimer » discret des fiches) : gris
  // au repos, ne devient rouge qu'à l'intention.
  "ghost-danger": "text-slate-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100",
};

// lg : saisie tablette — 16px (pas de zoom auto iOS) et grande cible tactile.
// min-h : cible tactile plancher (36px xs/sm, 44px md, 48px lg) même quand le
// libellé tient sur une ligne basse.
const SIZE: Record<ButtonSize, string> = {
  xs: "min-h-9 px-3 py-1.5 text-xs",
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-touch px-4 py-2 text-sm",
  lg: "min-h-touch-lg px-4 py-3 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 " +
  "disabled:opacity-50";

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
