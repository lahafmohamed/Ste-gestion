import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useOnline } from "../lib/online";

function Banner({
  tone,
  children,
}: {
  tone: "warn" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-brand-300 bg-white text-brand-900";
  return (
    <div
      // role=status : annoncé sans voler le focus au champ en cours de saisie.
      role="status"
      className={`flex min-h-touch flex-wrap items-center justify-center gap-2 border-b px-4 py-1.5 text-sm ${cls}`}
    >
      {children}
    </div>
  );
}

/** Bandeau « hors ligne » — visible seulement quand le réseau est tombé. */
export function OfflineBanner() {
  const online = useOnline();
  // Retour du réseau : confirmer 2,5 s au lieu de faire disparaître le bandeau
  // en silence. Sans ça, le pointeur ne sait pas si ses envois sont repartis.
  const [justBack, setJustBack] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setJustBack(true);
    const t = setTimeout(() => setJustBack(false), 2500);
    return () => clearTimeout(t);
  }, [online]);

  if (!online) {
    return (
      <Banner tone="warn">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
        Hors ligne — la saisie continue, l'envoi partira au retour du réseau.
      </Banner>
    );
  }
  if (justBack) {
    return (
      <div
        role="status"
        className="flex min-h-touch items-center justify-center border-b border-parc-300 bg-parc-50 px-4 py-1.5 text-sm text-parc-800"
      >
        Réseau rétabli — envoi des enregistrements en attente.
      </div>
    );
  }
  return null;
}

/** Nouvelle version installée : rechargement proposé, jamais imposé. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <Banner tone="info">
      Nouvelle version disponible.
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="min-h-touch rounded-lg bg-accent-500 px-3 py-1 font-medium text-white hover:bg-accent-600 active:bg-accent-700"
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="min-h-touch px-2 py-1 text-brand-500 underline hover:text-brand-900"
      >
        Plus tard
      </button>
    </Banner>
  );
}
