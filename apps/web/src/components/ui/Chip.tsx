import type { ButtonHTMLAttributes } from "react";

// Pastille cliquable (filtre, sélection). Sélectionné = slate-900, partout.
// lg : cible tactile parc (sélecteur de billes sur tablette).
const SIZE = {
  sm: "px-2.5 py-1 text-xs",
  lg: "px-3 py-2 text-sm",
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
      className={`rounded-full ring-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${SIZE[size]} ${
        selected
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
      }${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
