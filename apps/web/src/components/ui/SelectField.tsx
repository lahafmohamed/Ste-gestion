import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// ── Liste déroulante « maison » ───────────────────────────────────────
// Le menu d'un <select> natif est dessiné par l'OS : surlignage bleu système,
// lignes de 20px, aucune prise sur la palette. Ici la liste est du DOM — même
// surface que le calendrier (DateField), lignes tactiles, palette Atelier.
//
// La valeur reste une chaîne, comme sur un <select> : `onChange` rend la
// valeur brute, pas un événement.

export type SelectOption = {
  value: string;
  label: string;
  /** Précision à droite (statut, rôle…) — grise, jamais porteuse seule du sens. */
  hint?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Choix vide en tête de liste (valeur ""). Absent = pas de choix vide. */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Largeur du déclencheur : plein par défaut, `auto` en ligne dans une carte. */
  width?: "full" | "auto";
  "aria-label"?: string;
};

export default function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  id,
  className = "",
  width = "full",
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  // Monté avant d'être visible : le passage à `shown` en fin de frame donne
  // une transition (interruptible) au lieu d'une apparition sèche.
  const [shown, setShown] = useState(false);
  const [above, setAbove] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Recherche au clavier : les lettres tapées coup sur coup forment un préfixe.
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const items: SelectOption[] = placeholder
    ? [{ value: "", label: placeholder }, ...options]
    : options;
  const selectedIndex = items.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    // La liste s'ouvre sur le choix courant, pas sur la première ligne.
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
    // `selectedIndex` est lu mais hors dépendances à dessein : la position de
    // départ se fige à l'ouverture, elle ne doit pas sauter ensuite.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sens d'ouverture décidé sur la hauteur réelle, mesurée avant peinture
  // (la liste est encore à opacity 0) : pas de saut visible.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = wrapRef.current?.getBoundingClientRect();
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const noRoomBelow = anchor.bottom + 8 + pop.offsetHeight > window.innerHeight;
    setAbove(noRoomBelow && anchor.top - 8 - pop.offsetHeight > 0);
    // Un déclencheur étroit collé au bord droit (rôle d'un utilisateur, en-tête)
    // laisse déborder une liste plus large que lui : on l'aligne à droite.
    setAlignRight(anchor.left + pop.offsetWidth > window.innerWidth - 8);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // La ligne active suit les flèches, y compris hors de la zone visible.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function pick(i: number) {
    const o = items[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close();
  }

  /** Ligne suivante sélectionnable dans la direction donnée (saute les désactivées). */
  function step(from: number, dir: 1 | -1) {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
      if (!items[i].disabled) return i;
    }
    return from;
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => step(a, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => step(a, -1));
        return;
      case "Home":
        e.preventDefault();
        setActive(step(-1, 1));
        return;
      case "End":
        e.preventDefault();
        setActive(step(items.length, -1));
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        return;
      case "Escape":
      case "Tab":
        e.preventDefault();
        close();
        return;
    }
    // Frappe d'une lettre : on saute à la première ligne qui commence ainsi —
    // sur une liste de tiers, dérouler à la flèche serait interminable.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = performance.now();
      typed.current = {
        text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(),
        at: now,
      };
      const hit = items.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text)
      );
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`relative ${width === "full" ? "w-full" : "inline-block"}${
        className ? ` ${className}` : ""
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        className={`flex min-h-touch items-center justify-between gap-2 rounded-lg border border-brand-300 bg-white py-2 pl-3 pr-2.5 text-left text-base outline-none transition-[border-color,box-shadow] hover:border-brand-400 focus-visible:border-accent-500 focus-visible:ring-[3px] focus-visible:ring-accent-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
          width === "full" ? "w-full min-w-0" : ""
        } ${open ? "border-brand-900 ring-1 ring-brand-900" : ""} ${
          // Rien de choisi : le libellé reste un appel à choisir, pas une valeur.
          selected && selected.value !== "" ? "text-brand-900" : "text-brand-400"
        }`}
        {...aria}
      >
        <span className="truncate">{selected?.label ?? placeholder ?? ""}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          ref={popRef}
          className={`absolute z-overlay w-full min-w-[12rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-popover motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.2,0,0,1)] ${
            above ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"
          } ${alignRight ? "right-0" : "left-0"} ${
            shown ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
          }`}
        >
          {/* Un seul arrêt de tabulation : la liste se parcourt aux flèches,
              comme un <select> natif. */}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKeyDown}
            className="max-h-72 overflow-y-auto outline-none"
          >
            {/* Liste encore vide (tiers en cours de chargement) : le dire, plutôt
                qu'ouvrir une boîte vide sans explication. */}
            {items.length === 0 && (
              <p className="px-3 py-2 text-sm text-brand-400">Aucun choix disponible</p>
            )}
            {items.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value || "__empty"}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  disabled={o.disabled}
                  onPointerEnter={() => !o.disabled && setActive(i)}
                  onClick={() => pick(i)}
                  className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-base transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${
                    isSelected
                      ? "bg-accent-500 text-white"
                      : o.value === ""
                        ? "text-brand-400"
                        : "text-brand-800"
                  } ${
                    // Ligne survolée ou visée au clavier : même repère pour les
                    // deux, sinon la souris et les flèches racontent deux
                    // histoires différentes.
                    i === active && !isSelected ? "bg-accent-50 text-brand-900" : ""
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {o.hint && (
                      <span className={`text-sm ${isSelected ? "text-white/70" : "text-brand-400"}`}>
                        {o.hint}
                      </span>
                    )}
                    {/* La coche double la couleur : le choix reste lisible même
                        pour qui ne distingue pas l'aplat accent. */}
                    {isSelected && <CheckIcon />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Traits 1,5px : le poids optique du texte regular qui les entoure.
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 shrink-0 text-brand-400 transition-transform duration-150 ease-out ${
        open ? "-rotate-180" : ""
      }`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
