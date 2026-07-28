// Formules métier — cubage (F1/F2/F3) et splits du rapport d'activité.
// Math flottant volontaire : identique aux doubles Excel. Arrondi au stockage.
// Tous calculs critiques sont refaits côté backend ; le front ne fait que prévisualiser.

export const M3_TO_CFT = 35.3;

/** Seuil girth grosses billes (cm de circonférence). */
export const GIRTH_SPLIT_CM = 85;
/** Seuil LONG/SHORT des avivés (pieds). */
export const LONG_SPLIT_FT = 6.5;

/** Bandes d'épaisseur du rapport d'activité (pouces). */
export const THICKNESS_BANDS = [
  { key: "gte3", label: 'Ép 3" +', test: (t: number) => t >= 3 },
  { key: "b15to3", label: 'Ép 2 – 1,5"', test: (t: number) => t >= 1.5 && t < 3 },
  { key: "lt15", label: 'Ép 1,25 – 1"', test: (t: number) => t < 1.5 },
] as const;

/** F2 — girth/brousse : length en mètres, circonférence en cm. */
export function volumeGirthM3(lengthM: number, circCm: number): number {
  return (lengthM * circCm * circCm) / 160000;
}

/**
 * F1 — cubage diamètre. Malgré les noms de params (dette historique), les unités
 * réelles sont **length en mètres, diamètre en cm** (cf. FORMULAS.md F1) : la
 * constante π/4×10⁻⁴ ne matche l'Excel que sous cette lecture métrique.
 */
export function volumeDiameterM3(lengthFt: number, diaIn: number): number {
  return lengthFt * diaIn * diaIn * 0.00007854;
}

/** F3 — volume avivé : length en pieds, width/thickness en pouces, count pièces. */
export function sawnVolumeM3(
  lengthFt: number,
  widthIn: number,
  thicknessIn: number,
  count: number
): number {
  return ((lengthFt * widthIn * thicknessIn) / 144 / 35.315) * count;
}

// Lignes avivées minimales pour les splits (compatibles SawnLineDTO & saisie live).
type SawnSplitLine = {
  lengthFt: number | string;
  thicknessIn: number | string;
  volumeM3: number | string;
};

/** Split longueur LONG (≥ 6,5 ft) / SHORT — rapport d'activité. */
export function sawnLongShortM3(lines: SawnSplitLine[]): { longM3: number; shortM3: number } {
  let longM3 = 0;
  let shortM3 = 0;
  for (const l of lines) {
    const v = Number(l.volumeM3);
    if (Number(l.lengthFt) >= LONG_SPLIT_FT) longM3 += v;
    else shortM3 += v;
  }
  return { longM3, shortM3 };
}

/**
 * Coût total d'un camion scié (FCFA) — Daily Truck Log.
 * Cubage brousse (CBM BDR) payé au prix SODEFOR, cubage parc Ø (CBM DIA) au
 * prix Ibrahim, transport et cubage en forfaits par camion.
 * Les colonnes Cost / Cost MS-1.5" de l'Excel = ce total ÷ débité ou ÷ MS.
 */
export function truckCostCfa(p: {
  bdrM3: number;
  diaM3: number;
  sodeforPrice: number;
  ibrahimPrice: number;
  transportPrice: number;
  cubagePrice: number;
}): number {
  return (
    p.bdrM3 * p.sodeforPrice + p.diaM3 * p.ibrahimPrice + p.transportPrice + p.cubagePrice
  );
}

/** Répartition par bande d'épaisseur (m³) — rapport d'activité. */
export function sawnThicknessBands(
  lines: SawnSplitLine[]
): { key: string; label: string; m3: number }[] {
  const totals = THICKNESS_BANDS.map(() => 0);
  for (const l of lines) {
    const bi = THICKNESS_BANDS.findIndex((b) => b.test(Number(l.thicknessIn)));
    if (bi >= 0) totals[bi] += Number(l.volumeM3);
  }
  return THICKNESS_BANDS.map((b, i) => ({ key: b.key, label: b.label, m3: totals[i] }));
}
