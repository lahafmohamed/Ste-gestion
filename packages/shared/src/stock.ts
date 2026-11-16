// ── Stock d'avivés : inventaire, mouvements, suivi par épaisseur ──────
// Calqué sur les classeurs du client (2026-11) :
//   STOCK.xlsx  : pièces par L (ft) × l (in) × ép (in), volume F3 ;
//   SUIVI SCIAGE PAR EPAISSEUR : une ligne par mouvement, m³ ventilés en
//   12 colonnes (8" +, 6" & 7", A GRADE, 6X4 B … 1 inch).
// Stock = dernier inventaire + sciage + nouvelle mesure (recutting in)
//       − empotage − livraison − séchoir − menuiserie − rejets
//       − ancienne mesure (recutting out) − ventes.
// L'inventaire est une remise à zéro datée : comptage de fin de journée, il
// contient déjà les mouvements de son jour ; seuls ceux du lendemain ou
// après comptent en plus.

import { z } from "zod";
import { cuttingResumeKey } from "./formulas.js";
import { decimalString } from "./primitives.js";
import type { SizeGroup } from "./sizes.js";

// ── Qualité d'une pièce ────────────────────────────────────────────────
// B = qualité courante. A = « A GRADE » (meilleure), C = « C GRADE » (second
// choix) : chacune a sa colonne au suivi, quelle que soit la section (le
// RESUME STOCK du 14/11 range 6×5, 6×4 et 5×3 sous C GRADE, total égal à la
// colonne « 5X3 C » du SUIVI). Elle ne se déduit pas des dimensions.

export const Quality = z.enum(["A", "B", "C"]);
export type Quality = z.infer<typeof Quality>;

export const QUALITY_LABELS: Record<Quality, string> = {
  A: "A grade",
  B: "B",
  C: "C",
};

/**
 * Libellé de classeur (colonne PRODUITS / GRADE, grade du conteneur) →
 * qualité. « A GRADE », « A » → A ; « 5X3 C », « C GRADE » → C ; tout le
 * reste (8" +, MAIN SIZES, 6X3 B, vide…) → B.
 */
export function qualityFromLabel(label: string | null | undefined): Quality {
  if (!label) return "B";
  const g = label.toUpperCase().replace(/[ ]/g, " ").trim();
  if (/^A(\s*-?\s*GRADE)?$/.test(g) || /(^|[\s\d])A\s*GRADE\b/.test(g)) return "A";
  if (/(^|[\s\dX])C(\s*GRADE)?$/.test(g) || /\bC\s*GRADE\b/.test(g)) return "C";
  return "B";
}

// ── Colonnes du suivi par épaisseur ────────────────────────────────────

export type SuiviColumn = { key: string; label: string };

/** Les 12 colonnes du classeur SUIVI, dans son ordre. */
export const SUIVI_COLUMNS: readonly SuiviColumn[] = [
  { key: "8plus", label: '8" +' },
  { key: "6to7", label: '6" & 7"' },
  { key: "A", label: "A GRADE" },
  { key: "6x4B", label: "6X4 B" },
  { key: "6x3B", label: "6X3 B" },
  { key: "5x4B", label: "5X4 B" },
  { key: "5x3B", label: "5X3 B" },
  { key: "C", label: "C GRADE" },
  { key: "4x3", label: "4X3" },
  { key: "2in", label: "2 inch" },
  { key: "1.5in", label: "1,5 inch" },
  { key: "1in", label: "1 inch" },
];

/** Colonne absente du classeur, affichée seulement quand elle porte du volume. */
export const SUIVI_EXTRA_COLUMNS: readonly SuiviColumn[] = [{ key: "other", label: "Autre" }];

const ALL_SUIVI = [...SUIVI_COLUMNS, ...SUIVI_EXTRA_COLUMNS];

export function suiviColumnLabel(key: string): string {
  return ALL_SUIVI.find((c) => c.key === key)?.label ?? key;
}

export function suiviColumnIndex(key: string): number {
  const i = ALL_SUIVI.findIndex((c) => c.key === key);
  return i === -1 ? ALL_SUIVI.length : i;
}

/**
 * Colonne du suivi d'une pièce. Les qualités A et C priment (colonnes A GRADE
 * et C GRADE) ; sinon la règle dimensionnelle du résumé de sciage (largeur
 * ≥ 8 → 8" + …), les main sizes B ventilées par section (6X4 B…).
 */
export function suiviColumnKey(widthIn: number, thicknessIn: number, quality: Quality): string {
  if (quality === "A" || quality === "C") return quality;
  switch (cuttingResumeKey(widthIn, thicknessIn)) {
    case "oneInch":
      return "1in";
    case "w8plus":
      return "8plus";
    case "w6to7":
      return "6to7";
    case "side":
      if (thicknessIn === 2) return "2in";
      if (thicknessIn === 1.5) return "1.5in";
      return "4x3";
    case "main":
      return `${widthIn}x${thicknessIn}${quality}`;
    default:
      return "other";
  }
}

/** Colonnes à montrer : les 12 du classeur + les extras qui portent du volume. */
export function suiviVisibleColumns(usedKeys: Iterable<string>): SuiviColumn[] {
  const used = new Set(usedKeys);
  return [...SUIVI_COLUMNS, ...SUIVI_EXTRA_COLUMNS.filter((c) => used.has(c.key))];
}

// ── Mouvements saisis (inventaire et sorties) ──────────────────────────

export const StockMovementKind = z.enum([
  "INVENTAIRE",
  "LIVRAISON",
  "SECHOIR",
  "MENUISERIE",
  "REJET",
  "VENTE",
]);
export type StockMovementKind = z.infer<typeof StockMovementKind>;

/** Tous les mouvements du suivi : saisis ici, ou dérivés des autres modules. */
export type LedgerKind =
  | "INVENTAIRE"
  | "SCIAGE"
  | "RECUTTING_IN"
  | "EMPOTAGE"
  | "LIVRAISON"
  | "SECHOIR"
  | "MENUISERIE"
  | "REJET"
  | "RECUTTING_OUT"
  | "VENTE";

/** Libellés d'écran (casse de phrase). */
export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  INVENTAIRE: "Inventaire",
  SCIAGE: "Sciage",
  RECUTTING_IN: "Nouvelle mesure (recutting in)",
  EMPOTAGE: "Empotage",
  LIVRAISON: "Livraison (commande)",
  SECHOIR: "Bois pour séchoir",
  MENUISERIE: "Bois pour menuiserie",
  REJET: "Bois rejetés",
  RECUTTING_OUT: "Ancienne mesure (recutting out)",
  VENTE: "Vente",
};

/** Désignations du classeur SUIVI (capitales, comme le client les écrit). */
export const LEDGER_KIND_EXCEL: Record<LedgerKind, string> = {
  INVENTAIRE: "INVENTAIRE STOCK",
  SCIAGE: "SCIAGE",
  RECUTTING_IN: "NOUVELLE MESURE (RECUTTING IN)",
  EMPOTAGE: "EMPOTAGE",
  LIVRAISON: "LIVRAISON (COMMANDE)",
  SECHOIR: "BOIS POUR SECHOIR",
  MENUISERIE: "BOIS POUR MENUISERIE",
  REJET: "BOIS REJETES",
  RECUTTING_OUT: "ANCIENNE MESURE (RECUTTING OUT)",
  VENTE: "VENTES",
};

/** Sens du mouvement sur le stock. */
export const LEDGER_KIND_SIGN: Record<LedgerKind, 1 | -1> = {
  INVENTAIRE: 1,
  SCIAGE: 1,
  RECUTTING_IN: 1,
  EMPOTAGE: -1,
  LIVRAISON: -1,
  SECHOIR: -1,
  MENUISERIE: -1,
  REJET: -1,
  RECUTTING_OUT: -1,
  VENTE: -1,
};

/** Ordre dans une même journée : l'inventaire ouvre, les entrées avant les sorties. */
export const LEDGER_KIND_ORDER: readonly LedgerKind[] = [
  "INVENTAIRE",
  "SCIAGE",
  "RECUTTING_IN",
  "RECUTTING_OUT",
  "EMPOTAGE",
  "LIVRAISON",
  "VENTE",
  "SECHOIR",
  "MENUISERIE",
  "REJET",
];

/** Sorties saisies à la main (le reste vient des autres modules). */
export const STOCK_OUT_KINDS: readonly StockMovementKind[] = [
  "LIVRAISON",
  "VENTE",
  "SECHOIR",
  "MENUISERIE",
  "REJET",
];

export const stockLineInput = z.object({
  lengthFt: decimalString,
  widthIn: decimalString,
  thicknessIn: decimalString,
  count: z.coerce.number().int().min(1),
  quality: Quality.optional(),
});
export type StockLineInput = z.infer<typeof stockLineInput>;

export const stockMovementCreateSchema = z.object({
  kind: StockMovementKind,
  movedAt: z.coerce.date().optional(),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
  lines: z.array(stockLineInput).min(1, "Au moins une ligne"),
});
export type StockMovementCreateInput = z.infer<typeof stockMovementCreateSchema>;

export type StockLineDTO = {
  id: string;
  position: number;
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  count: number;
  quality: Quality;
  sizeCode: string;
  volumeM3: string;
};

export type StockMovementDTO = {
  id: string;
  kind: StockMovementKind;
  movedAt: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  /** Sources d'un import Excel (nom du fichier), sinon null. */
  sourceFile: string | null;
  lines: StockLineDTO[];
  totalM3: string;
  pieces: number;
};

// ── Suivi (journal) ────────────────────────────────────────────────────

export type LedgerRowDTO = {
  /** `kind:id` — unique dans le journal. */
  key: string;
  kind: LedgerKind;
  /** id de l'objet source (session, resciage, conteneur, mouvement). */
  sourceId: string;
  date: string;
  /** N° CBG (B/L des camions sciés), n° de conteneur, n° de commande… */
  reference: string | null;
  note: string | null;
  /** Signés : négatif pour une sortie. */
  volumeM3: string;
  pieces: number;
  byColumn: Record<string, string>;
};

export type StockLedgerDTO = {
  /** Dernier inventaire (base du stock), null = stock parti de zéro. */
  inventory: { id: string; movedAt: string; totalM3: string } | null;
  columns: SuiviColumn[];
  rows: LedgerRowDTO[];
  totals: { volumeM3: string; pieces: number; byColumn: Record<string, string> };
};

// ── Stock disponible par dimension ─────────────────────────────────────

export type StockRowDTO = {
  /** "6.5x6x3:B" */
  key: string;
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  quality: Quality;
  sizeCode: string;
  sizeGroup: SizeGroup;
  suiviKey: string;
  inventoryCount: number;
  producedCount: number;
  resawnInCount: number;
  resawnOutCount: number;
  /** Conteneurs en empotage, empotés ou expédiés. */
  packedCount: number;
  /** Livraisons, ventes, séchoir, menuiserie, rejets. */
  otherOutCount: number;
  /** Stock compté (comme le classeur STOCK). */
  stockCount: number;
  /** Pièces déjà placées dans un conteneur encore « Prévu ». */
  reservedCount: number;
  /** Stock − réservé : ce que l'empotage peut encore prendre. */
  availableCount: number;
  unitM3: string;
  stockM3: string;
  availableM3: string;
};

/** Clé de regroupement d'une pièce (dimensions + qualité). */
export function stockKey(L: number, w: number, t: number, q: Quality): string {
  return `${L}x${w}x${t}:${q}`;
}

// ── Import d'un classeur au format STOCK ───────────────────────────────
// Tableau N° · PRODUITS · LONGUEUR (FEET) · LARGEUR (INCH) · EPAISSEUR (INCH)
// · NBR DELIGNE : le classeur STOCK du client, l'export STOCK de la
// plateforme, ou un DEBITES / EMPOTAGES. La colonne PRODUITS (ou GRADE) donne
// la qualité. Les feuilles choisies forment UN mouvement (un inventaire ou
// une sortie) : deux inventaires séparés, seul le dernier compterait.

const stockImportFile = {
  filename: z.string().trim().min(1).max(200),
  fileBase64: z.string().min(1),
  kind: StockMovementKind,
};

export const stockImportPreviewSchema = z.object(stockImportFile);
export type StockImportPreviewInput = z.infer<typeof stockImportPreviewSchema>;

export const stockImportApplySchema = z.object({
  ...stockImportFile,
  sheets: z.array(z.string().min(1)).min(1, "Choisir au moins une feuille"),
  movedAt: z.coerce.date().optional(),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});
export type StockImportApplyInput = z.infer<typeof stockImportApplySchema>;

export type StockImportIssue = { level: "error" | "warning"; message: string; row?: number };

export type StockImportSheetDTO = {
  name: string;
  /** false = pas de tableau L × l × ép lisible : feuille écartée. */
  usable: boolean;
  /** Date lue dans le nom de la feuille (« … DU 24-10-2026 »), ISO. */
  date: string | null;
  lineCount: number;
  pieceCount: number;
  totalM3: string;
  byColumn: Record<string, string>;
  issues: StockImportIssue[];
};

export type StockImportPreviewDTO = {
  kind: StockMovementKind;
  sheets: StockImportSheetDTO[];
};
