const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const nfInt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
// Volumes affichés : trois décimales au plus (le litre) — « 58,106998 m³ »
// noyait le chiffre utile et débordait des tuiles sur téléphone.
const nfM3 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

// Espace insécable avant l'unité : « 300,522 » et « m³ » ne se séparent plus
// en fin de ligne. Fine insécable avant « % » (typographie française).
const NBSP = "\u00A0";
const NNBSP = "\u202F";

/** Vrai signe moins : le « - » d'Intl est un trait d'union, plus court que « + ». */
function minus(s: string): string {
  return s.replace("-", "−");
}

export function fmtM3(v: string | number): string {
  const n = Number(v);
  // Un reste d'arrondi ne s'affiche pas « −0 m³ ».
  return `${minus(nfM3.format(Math.abs(n) < 0.0005 ? 0 : n))}${NBSP}m³`;
}

export function fmtFcfa(v: string | number): string {
  return `${minus(nfInt.format(Number(v)))}${NBSP}FCFA`;
}

export function fmtInt(v: string | number): string {
  return nfInt.format(Number(v));
}

export function fmtNum(v: string | number): string {
  return nf.format(Number(v));
}

const nf3 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Trois décimales fixes et vrai signe moins, pour les colonnes de m³ :
 * « 0,040 » s'aligne sous « 3,339 » (fmtNum rogne les zéros, les virgules
 * se décalent d'une ligne à l'autre). Un reste d'arrondi ne s'affiche pas
 * « −0,000 ».
 */
export function fmtDec3(v: string | number): string {
  const n = Number(v);
  return nf3.format(Math.abs(n) < 0.0005 ? 0 : n).replace("-", "−");
}

const nfPct = new Map<number, Intl.NumberFormat>();

/** Pourcentage à la française : virgule décimale (« 18,4 % », plus « 18.4 % »). */
export function fmtPct(v: number, digits = 1): string {
  let f = nfPct.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    nfPct.set(digits, f);
  }
  return `${minus(f.format(v))}${NNBSP}%`;
}

/**
 * Saisie décimale FR → format machine : « 33,171 » → « 33.171 ».
 * Les claviers du parc (et l'habitude) donnent la virgule, alors que Number()
 * et l'API attendent le point — sans ça le volume live reste à « — » et
 * l'enregistrement part en erreur de validation.
 * À appeler dans onChange, pour que la correction soit visible pendant la frappe.
 */
export function normalizeDecimal(v: string): string {
  return v.replace(/,/g, ".");
}

/**
 * Date locale du jour en YYYY-MM-DD (input type=date, borne max des dates
 * saisies — un camion ou une session de sciage n'arrive pas dans le futur).
 */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** % utilisé du quota, borné [0,100+], -1 si quota 0. */
export function usedPct(used: string | number, quota: string | number): number {
  const q = Number(quota);
  if (q <= 0) return -1;
  return (Number(used) / q) * 100;
}
