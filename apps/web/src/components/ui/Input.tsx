import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

// Champs de formulaire unifiés.
// text-base (16px) : sous ce seuil iOS zoome la page au focus.
// min-h-touch : plancher tactile 44px — la saisie se fait au pouce sur tablette.
// focus : bordure teck + halo 3px translucide — périmètre visible ≥ 2px
// (plancher WCAG), et la couleur d'accent signale « c'est ici qu'on tape ».
export const inputCls =
  "w-full min-w-0 min-h-touch rounded-lg border border-brand-300 bg-white px-3 py-2 " +
  "text-base text-brand-900 outline-none transition-[border-color,box-shadow] " +
  "hover:border-brand-400 focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Variante discrète pour les grilles de saisie en rafale (TallyEntry, SawnEntry). */
export const inputQuietCls =
  "w-full min-w-0 min-h-touch rounded-lg border border-brand-200 bg-white px-2.5 py-2 " +
  "text-base text-brand-900 outline-none transition-[border-color,box-shadow] " +
  "focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/20";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** quiet : bordure plus légère (grilles de relevé). */
  variant?: "default" | "quiet";
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = "default", className = "", ...rest },
  ref
) {
  const base = variant === "quiet" ? inputQuietCls : inputCls;
  return (
    <input ref={ref} className={`${base}${className ? ` ${className}` : ""}`} {...rest} />
  );
});

export default Input;

/** Libellé + champ empilés — la structure `<label>` répétée de tous les formulaires. */
export function Field({
  label,
  error,
  errorId,
  children,
  className = "",
}: {
  label: ReactNode;
  /** Erreur de validation inline, affichée sous le champ (rouge). */
  error?: ReactNode;
  /** id du texte d'erreur — à référencer via aria-describedby sur le champ. */
  errorId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm${className ? ` ${className}` : ""}`}>
      <span className="font-medium text-brand-600">{label}</span>
      {children}
      {error && (
        <span id={errorId} className="text-xs text-red-600 motion-safe:animate-rise-in">
          {error}
        </span>
      )}
    </label>
  );
}

/** Classes à ajouter à un champ en erreur (bordure + ring rouges). Les `!`
 * garantissent la priorité sur les couleurs de base d'inputCls. */
export const inputErrorCls =
  "!border-red-400 focus:!border-red-600 focus:!ring-red-600/20";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
};

/** Recherche avec croix d'effacement — le bloc copié-collé des pages à liste. */
export function SearchInput({ value, onChange, className = "", ...rest }: SearchInputProps) {
  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} pr-11`}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Effacer la recherche"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-lg text-brand-400 hover:text-brand-900 active:text-brand-900"
        >
          ×
        </button>
      )}
    </div>
  );
}
