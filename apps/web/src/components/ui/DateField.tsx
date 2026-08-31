import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

// ── Champ date « maison » ─────────────────────────────────────────────
// Le calendrier natif de Chrome ne se style pas (cellules 20px, palette
// système). Ici : frappe libre en jj/mm/aaaa pour le bureau, grille tactile
// 44px pour la tablette au parc, et la palette Atelier partout.
//
// Contrat identique aux anciens `<Input type="date">` : `value` et `onChange`
// parlent ISO (YYYY-MM-DD), `min`/`max` bornent la saisie.

const WEEKDAYS = ["lu", "ma", "me", "je", "ve", "sa", "di"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date locale → ISO (jamais toISOString : il repasse en UTC et décale d'un jour). */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO → Date locale à midi (midi : à l'abri des sauts d'heure d'été). */
function fromISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  // 31/02 → 03/03 : Date « corrige » en silence, on refuse plutôt.
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** ISO → jj/mm/aaaa (ce que l'opérateur lit et tape). */
function toText(iso: string): string {
  const d = fromISO(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}

/**
 * Frappe libre → ISO. Accepte 31/08/2026, 31-8-26, 31082026 : au parc on tape
 * vite, et exiger les zéros et les slashes ferait rejeter des dates justes.
 */
function parseText(text: string): string | null {
  let day: number, month: number, year: number;
  // Séparateurs d'abord : « 1/1/2026 » fait six chiffres et serait lu
  // 11/20/26 si on découpait par longueur.
  const parts = text.split(/\D+/).filter(Boolean);
  if (parts.length === 3) {
    [day, month, year] = parts.map(Number);
    if (year < 100) year += 2000;
  } else {
    const digits = text.replace(/\D/g, "");
    if (digits.length !== 8 && digits.length !== 6) return null;
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = digits.length === 8 ? Number(digits.slice(4)) : 2000 + Number(digits.slice(4));
  }
  if (!day || !month || !year || month > 12 || day > 31 || year < 1900) return null;
  return fromISO(`${year}-${pad(month)}-${pad(day)}`) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

function addMonths(d: Date, n: number): Date {
  // Le 31 janvier + 1 mois ne doit pas déborder sur mars : on repart du 1er.
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** 42 cases (6 semaines) : la grille garde la même hauteur d'un mois à l'autre. */
function monthGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1, 12);
  // getDay() : 0 = dimanche. Semaine française → lundi en tête.
  const lead = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
}

const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const fullLabel = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

type Props = {
  value: string;
  onChange: (iso: string) => void;
  /** Bornes ISO incluses — hors bornes, le jour est affiché mais non cliquable. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

export default function DateField({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  id,
  className = "",
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  // Monté avant d'être visible : le passage à `shown` en fin de frame donne
  // une transition (interruptible) au lieu d'une apparition sèche.
  const [shown, setShown] = useState(false);
  const [above, setAbove] = useState(false);
  const [text, setText] = useState(() => toText(value));
  const [cursor, setCursor] = useState<Date>(() => fromISO(value) ?? new Date());

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridId = useId();

  const selected = fromISO(value);
  const todayIso = toISO(new Date());

  // La valeur peut changer hors frappe (reset de formulaire, chargement).
  useEffect(() => {
    setText(toText(value));
    const d = fromISO(value);
    if (d) setCursor(d);
  }, [value]);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  // Le sens d'ouverture se décide sur la hauteur réelle du calque, mesurée
  // avant la peinture (il est encore à opacity 0) : pas de saut visible, et
  // pas de constante à corriger si le calendrier change de gabarit.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = wrapRef.current?.getBoundingClientRect();
    const height = popRef.current?.offsetHeight ?? 0;
    if (anchor) {
      const noRoomBelow = anchor.bottom + 8 + height > window.innerHeight;
      setAbove(noRoomBelow && anchor.top - 8 - height > 0);
    }
  }, [open]);

  // La grille prend le focus à l'ouverture : les flèches servent aussitôt.
  useEffect(() => {
    if (open) gridRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const weeks = useMemo(() => {
    const days = monthGrid(cursor);
    return Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  }, [cursor]);
  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));

  function commitText(raw: string) {
    const iso = parseText(raw);
    if (iso && !outOfRange(iso)) {
      onChange(iso);
      setText(toText(iso));
    } else {
      // Saisie inexploitable : on revient à la dernière valeur valide plutôt
      // que de laisser un champ à moitié tapé partir au serveur.
      setText(toText(value));
    }
  }

  function pick(d: Date) {
    const iso = toISO(d);
    if (outOfRange(iso)) return;
    onChange(iso);
    setText(toText(iso));
    setOpen(false);
    inputRef.current?.focus();
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in moves) {
      e.preventDefault();
      setCursor((c) => addDays(c, moves[e.key]));
      return;
    }
    switch (e.key) {
      case "PageUp":
      case "PageDown":
        e.preventDefault();
        setCursor((c) => addMonths(c, e.key === "PageUp" ? -1 : 1));
        break;
      case "Home":
        e.preventDefault();
        setCursor((c) => new Date(c.getFullYear(), c.getMonth(), 1, 12));
        break;
      case "End":
        e.preventDefault();
        setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 0, 12));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(cursor);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        inputRef.current?.focus();
        break;
    }
  }

  const label = monthLabel.format(cursor);

  return (
    <div ref={wrapRef} className={`relative${className ? ` ${className}` : ""}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="jj/mm/aaaa"
        required={required}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Date déjà écrite proprement : Entrée doit valider le formulaire
            // comme avant. Sinon on retient la touche pour normaliser d'abord.
            const iso = parseText(text);
            if (iso && toText(iso) === text && !outOfRange(iso)) return;
            e.preventDefault();
            commitText(text);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        className="w-full min-w-0 min-h-touch rounded-lg border border-brand-300 bg-white py-2 pl-3 pr-11 text-base text-brand-900 outline-none transition-[border-color,box-shadow] focus:border-brand-900 focus:ring-1 focus:ring-brand-900 disabled:cursor-not-allowed disabled:opacity-50"
        {...aria}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer le calendrier" : "Ouvrir le calendrier"}
        aria-expanded={open}
        aria-controls={open ? gridId : undefined}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-brand-400 transition-[color,transform] duration-150 ease-out hover:text-brand-900 focus-visible:text-brand-900 focus-visible:outline-none motion-safe:active:scale-[0.96] active:text-brand-900 disabled:opacity-50"
      >
        <CalendarIcon />
      </button>

      {open && (
        <div
          ref={popRef}
          id={gridId}
          role="dialog"
          aria-label="Choisir une date"
          // 21rem = 7 cellules de 44px + gouttières + padding : la largeur
          // découle du plancher tactile, elle n'est pas choisie à l'œil.
          className={`absolute left-0 z-overlay w-[21rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-popover motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.2,0,0,1)] ${
            above ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"
          } ${shown ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}`}
        >
          {/* En-tête : mois courant + navigation. */}
          <div className="mb-1 flex items-center justify-between gap-1">
            <NavButton label="Mois précédent" onClick={() => setCursor((c) => addMonths(c, -1))}>
              <ChevronIcon dir="left" />
            </NavButton>
            <div
              aria-live="polite"
              className="flex-1 text-center text-sm font-medium capitalize text-brand-900"
            >
              {label}
            </div>
            <NavButton label="Mois suivant" onClick={() => setCursor((c) => addMonths(c, 1))}>
              <ChevronIcon dir="right" />
            </NavButton>
          </div>

          {/* Un seul tabindex pour toute la grille (focus glissant aux flèches) —
              42 arrêts de tabulation seraient impraticables au clavier.
              `contents` sur les lignes : la sémantique de tableau tient sans
              casser la grille 7 colonnes. */}
          <div
            ref={gridRef}
            role="grid"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-7 gap-0.5 outline-none"
          >
            <div role="row" className="contents">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  role="columnheader"
                  className="py-1 text-center text-xs text-brand-500"
                >
                  {w}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={toISO(week[0])} role="row" className="contents">
                {week.map((d) => {
                  const iso = toISO(d);
                  const isSelected = selected != null && iso === toISO(selected);
                  const isCursor = iso === toISO(cursor);
                  const isToday = iso === todayIso;
                  const outside = d.getMonth() !== cursor.getMonth();
                  const blocked = Boolean(outOfRange(iso));
                  return (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={fullLabel.format(d)}
                      disabled={blocked}
                      onClick={() => pick(d)}
                      className={`flex h-11 items-center justify-center rounded-lg text-base tabular-nums transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30 ${
                        isSelected
                          ? "bg-accent-500 font-semibold text-white"
                          : outside
                            ? "text-brand-300 hover:bg-brand-50"
                            : "text-brand-800 hover:bg-accent-50"
                      } ${
                        // Aujourd'hui garde un repère même une fois un autre
                        // jour choisi.
                        isToday && !isSelected
                          ? "font-semibold text-accent-700 ring-1 ring-accent-300"
                          : ""
                      } ${
                        // Cible du clavier : visible sans voler l'aspect
                        // « sélectionné ».
                        isCursor && !isSelected ? "ring-1 ring-brand-900" : ""
                      }`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-1 flex items-center justify-between border-t border-brand-100 pt-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setText("");
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="min-h-touch rounded-lg px-3 text-sm font-medium text-brand-500 transition-[color,background-color,transform] duration-150 ease-out hover:bg-brand-50 hover:text-brand-900 motion-safe:active:scale-[0.96]"
            >
              Effacer
            </button>
            <button
              type="button"
              disabled={Boolean(outOfRange(todayIso))}
              onClick={() => pick(new Date())}
              className="min-h-touch rounded-lg px-3 text-sm font-medium text-accent-700 transition-[color,background-color,transform] duration-150 ease-out hover:bg-accent-50 motion-safe:active:scale-[0.96] disabled:opacity-40"
            >
              Aujourd'hui
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-brand-500 transition-[background-color,color,transform] duration-150 ease-out hover:bg-brand-50 hover:text-brand-900 motion-safe:active:scale-[0.96]"
    >
      {children}
    </button>
  );
}

// Traits 1,5px : le poids optique du texte regular qui les entoure.
function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
