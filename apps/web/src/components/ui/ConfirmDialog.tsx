import { useEffect, useRef } from "react";
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
};

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Ouvert : fond figé + Échap + focus sur « Annuler » (le choix sans risque).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // onCancel recréé à chaque rendu par l'hôte : le retenir relancerait l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-overlay flex items-end justify-center p-4 sm:items-center">
      <div
        onClick={onCancel}
        aria-hidden="true"
        className="absolute inset-0 bg-brand-950/50 backdrop-blur-[2px] motion-safe:animate-fade-in"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-dialog pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] motion-safe:animate-pop-in sm:pb-5"
      >
        <div className="text-base font-semibold text-brand-900">{title}</div>
        {children && <div className="mt-1.5 text-sm text-brand-600">{children}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Suppression…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
