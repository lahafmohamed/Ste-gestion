import type { ButtonHTMLAttributes } from "react";

// Pastille cliquable (filtre, sélection). Sélectionné = slate-900, partout.
// lg : cible tactile parc (sélecteur de billes sur tablette).
// min-h : les filtres se tapent au pouce — plancher 36px (sm) / 44px (lg).
const SIZE = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  lg: "min-h-11 px-3.5 py-2 text-sm",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  size?: keyof typeof SIZE;
};

export default function Chip({
  selected = false,
  size = "sm",
  type = "button",
  className = "",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-full ring-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${SIZE[size]} ${
        selected
          ? "bg-slate-900 text-white ring-slate-900 active:bg-slate-700"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400 active:bg-slate-100"
      }${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
