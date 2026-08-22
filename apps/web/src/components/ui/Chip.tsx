import type { ButtonHTMLAttributes } from "react";

// Pastille cliquable (filtre, sélection). Sélectionné = brand-900, partout.
// lg : cible tactile parc (sélecteur de billes sur tablette).
// min-h : les filtres se tapent au pouce — plancher tactile 44px partout.
const SIZE = {
  sm: "min-h-touch px-3 py-1.5 text-sm",
  lg: "min-h-touch px-3.5 py-2 text-base",
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
      className={`inline-flex items-center justify-center rounded-full ring-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900 ${SIZE[size]} ${
        selected
          ? "bg-brand-900 text-white ring-brand-900 active:bg-brand-700"
          : "bg-white text-brand-600 ring-brand-200 hover:ring-brand-400 active:bg-brand-100"
      }${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
