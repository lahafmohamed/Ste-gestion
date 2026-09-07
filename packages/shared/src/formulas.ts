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
  count: number,
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
  return p.bdrM3 * p.sodeforPrice + p.diaM3 * p.ibrahimPrice + p.transportPrice + p.cubagePrice;
}

// ── Cutting résumé (classeur « CUTTING RESUME TRUCK ») ──────────────────
// Découpe plus fine que SizeGroup : les gros sciages sortent de « Main »
// (8"+ à part, 6"&7" à part), le reste suit F4. Règles calées sur les
// classeurs DEBITES du 15-05-2026 et RESUME DEBITES du 02-09-2026 (somme des
// lignes = total débité au millième).
//
// Le second porte une colonne GRADE tenue à la main : elle fait foi quand
// elle est présente (« A GRADE » est une qualité, pas une taille — un 6x3 peut
// y être rangé au lieu de Main ; on ne peut pas le deviner des dimensions).

type CuttingLine = SawnSplitLine & { widthIn: number | string; grade?: string | null };

export const CUTTING_RESUME_ROWS = [
  { key: "w8plus", label: '8" +' },
  { key: "w6to7", label: '6" & 7"' },
  { key: "aGrade", label: "A grade" },
  { key: "main", label: "Main sizes" },
  { key: "side", label: "Side sizes" },
  { key: "oneInch", label: '1"' },
  { key: "other", label: "Autre" },
] as const;
export type CuttingResumeKey = (typeof CUTTING_RESUME_ROWS)[number]["key"];

/** Règle dimensionnelle (sans colonne GRADE). */
export function cuttingResumeKey(widthIn: number, thicknessIn: number): CuttingResumeKey {
  if (thicknessIn === 1) return "oneInch";
  // Largeur ≥ 8 prime sur l'épaisseur : le parc range 8x1,5 ou 9x2 en 8"+.
  if (widthIn >= 8) return "w8plus";
  if (thicknessIn === 1.5 || thicknessIn === 2) return "side";
  const pair = `${widthIn}x${thicknessIn}`;
  if (pair === "4x3") return "side";
  if (["6x4", "6x3", "5x4", "5x3"].includes(pair)) return "main";
  if (widthIn >= 6) return "w6to7";
  return "other";
}

/** Libellé de la colonne GRADE du classeur → famille ; `null` si inconnu. */
export function cuttingResumeKeyFromGrade(grade: string): CuttingResumeKey | null {
  // Retire espaces et toutes les variantes de guillemets (" ' ’ ” ″).
  const g = grade.toUpperCase().replace(/[\s"'\u2019\u201D\u2033]/g, "");
  if (/^8/.test(g)) return "w8plus";
  if (/^6&7|^6ET7|^6AND7/.test(g)) return "w6to7";
  if (/^A(GRADE)?$/.test(g)) return "aGrade";
  if (/^MAIN/.test(g)) return "main";
  if (/^SIDE/.test(g)) return "side";
  if (/^1$|^1POUCE|^1INCH/.test(g)) return "oneInch";
  return null;
}

export type CuttingResume = {
  rows: { key: CuttingResumeKey; label: string; m3: number; pct: number }[];
  totalM3: number;
  longM3: number;
  shortM3: number;
};

/** Résumé de découpe d'un lot de lignes avivées (session, conteneur, feuille importée). */
export function cuttingResume(lines: CuttingLine[]): CuttingResume {
  const totals: Record<CuttingResumeKey, number> = {
    w8plus: 0,
    w6to7: 0,
    aGrade: 0,
    main: 0,
    side: 0,
    oneInch: 0,
    other: 0,
  };
  for (const l of lines) {
    const fromGrade = l.grade ? cuttingResumeKeyFromGrade(l.grade) : null;
    const key = fromGrade ?? cuttingResumeKey(Number(l.widthIn), Number(l.thicknessIn));
    totals[key] += Number(l.volumeM3);
  }
  const totalM3 = Object.values(totals).reduce((a, b) => a + b, 0);
  const { longM3, shortM3 } = sawnLongShortM3(lines);
  return {
    rows: CUTTING_RESUME_ROWS.map((r) => ({
      key: r.key,
      label: r.label,
      m3: totals[r.key],
      pct: totalM3 > 0 ? (totals[r.key] / totalM3) * 100 : 0,
    })),
    totalM3,
    longM3,
    shortM3,
  };
}

/** Répartition par bande d'épaisseur (m³) — rapport d'activité. */
export function sawnThicknessBands(
  lines: SawnSplitLine[],
): { key: string; label: string; m3: number }[] {
  const totals = THICKNESS_BANDS.map(() => 0);
  for (const l of lines) {
    const bi = THICKNESS_BANDS.findIndex((b) => b.test(Number(l.thicknessIn)));
    if (bi >= 0) totals[bi] += Number(l.volumeM3);
  }
  return THICKNESS_BANDS.map((b, i) => ({ key: b.key, label: b.label, m3: totals[i] }));
}
