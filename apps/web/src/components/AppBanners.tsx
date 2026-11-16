import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useOnline } from "../lib/online";
import Button from "./ui/Button";
import { IconCheck, IconRefresh, IconWifiOff, type IconProps } from "./icons";

// Trois états d'application, un seul gabarit : bande pleine largeur sous
// l'en-tête, filet bas de structure (pas d'ombre : elle est collée au header).
// L'icône double la couleur — l'état se lit sans distinguer l'ambre du vert.
const TONE = {
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "text-amber-600" },
  info: { box: "border-brand-200 bg-white text-brand-900", icon: "text-accent-600" },
  success: { box: "border-parc-300 bg-parc-50 text-parc-900", icon: "text-parc-700" },
} as const;

function Banner({
  tone,
  icon: Glyph,
  children,
}: {
  tone: keyof typeof TONE;
  icon: (p: IconProps) => JSX.Element;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      // role=status : annoncé sans voler le focus au champ en cours de saisie.
      role="status"
      className={`flex min-h-touch flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b px-4 py-1.5 text-sm ${t.box}`}
    >
      <span className="flex min-w-0 items-center gap-2 text-pretty">
        <Glyph width={18} height={18} className={`shrink-0 ${t.icon}`} />
        {children}
      </span>
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
      <Banner tone="warn" icon={IconWifiOff}>
        Hors ligne — la saisie continue, l'envoi partira au retour du réseau.
      </Banner>
    );
  }
  if (justBack) {
    return (
      <Banner tone="success" icon={IconCheck}>
        Réseau rétabli — envoi des enregistrements en attente.
      </Banner>
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
    <div
      role="status"
      className={`flex min-h-touch flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b px-4 py-1.5 text-sm ${TONE.info.box}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <IconRefresh width={18} height={18} className={`shrink-0 ${TONE.info.icon}`} />
        Nouvelle version disponible.
      </span>
      {/* Le moment du rechargement reste au pointeur : jamais en plein relevé
          sans qu'il l'ait choisi. */}
      <span className="flex items-center gap-2">
        <Button variant="primary" size="xs" onClick={() => void updateServiceWorker(true)}>
          Recharger
        </Button>
        <Button size="xs" onClick={() => setNeedRefresh(false)}>
          Plus tard
        </Button>
      </span>
    </div>
  );
}
