import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import Button from "./Button";

// Remplace window.confirm : lisible sur tablette (boutons ≥44px), Échap,
// voile cliquable, fond figé. Les callbacks portent la même logique qu'avant —
// seul l'habillage change.

type Props = {
  open: boolean;
  title: string;
  /** Corps du message — dire ce qui sera perdu. */
  children?: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * danger (défaut) : suppression, perte de données — bouton rouge.
   * primary : changement réversible mais large (droits d'un rôle…) — bouton teck.
   */
  tone?: "danger" | "primary";
  /** Libellé du bouton pendant l'envoi (défaut : « Suppression… » / « Enregistrement… »). */
  pendingLabel?: string;
};

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
  tone = "danger",
  pendingLabel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Ouvert : fond figé + Échap + focus sur « Annuler » (le choix sans risque).
  // Tab boucle dans la boîte : sans ça, le focus repart sur la page voilée.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      const focusables = boxRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      // Focus rendu au bouton qui a ouvert la boîte (s'il existe encore).
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // onCancel recréé à chaque rendu par l'hôte : le retenir relancerait l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const busyLabel = pendingLabel ?? (tone === "danger" ? "Suppression…" : "Enregistrement…");

  return (
    <div className="fixed inset-0 z-overlay flex items-end justify-center p-4 sm:items-center">
      {/* Voile opaque seul, sans flou (règle Atelier : pas de backdrop-blur). */}
      <div
        onClick={onCancel}
        aria-hidden="true"
        className="absolute inset-0 bg-brand-950/50 motion-safe:animate-fade-in"
      />
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-dialog pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] motion-safe:animate-pop-in sm:pb-5"
      >
        <h2 id={titleId} className="text-base font-semibold text-brand-900">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-1.5 text-pretty text-sm text-brand-600">
            {children}
          </div>
        )}
        {/* Téléphone : boutons pleine largeur empilés, « Annuler » en bas (le
            geste sans risque reste au plus près du pouce, comme une feuille
            d'actions) ; à partir de sm, côte à côte à droite. */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} onClick={onCancel} className="w-full sm:w-auto">
            Annuler
          </Button>
          <Button
            variant={tone}
            onClick={onConfirm}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
