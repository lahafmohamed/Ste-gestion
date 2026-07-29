import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "emerald" | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-700",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:border-slate-900",
  // Réservé aux actions de la chaîne parc (étaler, billonner, bille suivante).
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

// lg : saisie tablette — 16px (pas de zoom auto iOS) et grande cible tactile.
const SIZE: Record<ButtonSize, string> = {
  xs: "px-3 py-1.5 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-3 text-base",
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

export default function Button({
  variant = "secondary",
  size = "md",
  // type explicite : un bouton nu dans un <form> soumettrait le formulaire.
  type = "button",
  className = "",
  ...rest
}: Props) {
  return <button type={type} className={buttonCls(variant, size, className)} {...rest} />;
}
