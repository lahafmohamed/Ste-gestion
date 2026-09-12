// Import des classeurs Excel du terrain (repli quand le réseau manque en
// brousse) : DIAMETRE, GIRTH, DEBITES, EMPOTAGES — une feuille = un camion
// (ou un conteneur). Types partagés API ↔ interface.

import { z } from "zod";

export const ImportSheetType = z.enum([
  "YARD_DIAMETER",
  "YARD_GIRTH",
  "SAWN",
  "CONTAINER",
  "UNKNOWN",
]);
export type ImportSheetType = z.infer<typeof ImportSheetType>;

export const IMPORT_SHEET_LABELS: Record<ImportSheetType, string> = {
  YARD_DIAMETER: "Étalage Ø (billes)",
  YARD_GIRTH: "Billonnage (girth)",
  SAWN: "Débitage",
  CONTAINER: "Empotage (conteneur)",
  UNKNOWN: "Non reconnue",
};

export type ImportIssue = { level: "error" | "warning"; message: string; row?: number };

/** Métadonnées lues dans la marge du classeur (titre, colonne H…). */
export type ImportSheetMeta = {
  registration?: string;
  deliveryNote?: string;
  declaredFieldM3?: string;
  contractCode?: string;
  /** Marge du relevé Ø : « PARCELLE 70-2002/04 » et provenance (KASSA…). */
  parcel?: string;
  origin?: string;
  /** Date de la feuille (« … DU 12-05-2026 »), ISO. */
  date?: string;
  containerNo?: string;
  sealNo?: string;
  grade?: string;
  /** Total porté par le classeur (VOL-DIA, VOL-G, DEBITE) — pour l'écart. */
  excelTotalM3?: string;
  /** « Nbre elm » de l'empotage : nombre de pièces porté par le classeur. */
  excelPieceCount?: number;
};

/** Une ligne telle qu'elle sera créée (volume recalculé par l'app). */
export type ImportLine = {
  n: number;
  /** N° bille / billon (relevés) — vide pour débité/empotage. */
  id?: string;
  a: string;
  b: string;
  c?: string;
  count?: number;
  /** Colonne GRADE / PRODUITS du classeur (8'' +, MAIN SIZES, A GRADE…), si présente. */
  grade?: string;
  /** Colonne FEUIL : n° de la feuille papier (le N° repart à 1 à chaque feuille). */
  page?: number;
  volumeM3: string;
  /** Volume de la colonne Excel, s'il y en a une (comparaison). */
  excelM3?: string;
};

export type ImportSheetPreview = {
  name: string;
  type: ImportSheetType;
  meta: ImportSheetMeta;
  /** Camion visé (relevés / débitage). */
  truck: { id: string; registration: string; deliveryNote: string | null } | null;
  truckAction: "match" | "create" | "none";
  lines: ImportLine[];
  totalM3: string;
  pieceCount: number;
  issues: ImportIssue[];
  /** Permission requise pour appliquer cette feuille (`module.action`). */
  permission: string;
  hasPermission: boolean;
  canApply: boolean;
};

export type ImportPreviewDTO = {
  filename: string;
  contract: { id: string; code: string; status: string };
  sheets: ImportSheetPreview[];
};

export type ImportAppliedSheet = {
  name: string;
  type: ImportSheetType;
  truckId?: string;
  createdTruck?: boolean;
  /** Id de l'objet créé : relevé, session ou conteneur. */
  createdId: string;
  lines: number;
  /** Volume recalculé par l'app pour cette feuille (m³). */
  volumeM3?: string;
};

export type ImportSkippedSheet = { name: string; reason: string };

export type ImportApplyDTO = {
  applied: ImportAppliedSheet[];
  skipped: ImportSkippedSheet[];
  /** Ligne d'historique créée quand au moins une feuille est enregistrée. */
  batchId?: string;
};

/** Une ligne du journal des imports réussis (le plus récent d'abord). */
export type ImportBatchDTO = {
  id: string;
  filename: string;
  createdAt: string;
  user: { id: string; name: string } | null;
  sheetCount: number;
  lineCount: number;
  pieceCount: number;
  totalM3: string;
  createdTrucks: number;
  applied: ImportAppliedSheet[];
  skipped: ImportSkippedSheet[];
};

const fileFields = {
  contractId: z.string().min(1),
  filename: z.string().trim().min(1).max(200),
  /** Classeur .xlsx encodé en base64 (≤ 6 Mo). */
  fileBase64: z.string().min(1).max(8_000_000),
};

export const importPreviewSchema = z.object(fileFields);
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;

export const importApplySchema = z.object({
  ...fileFields,
  /** Noms des feuilles à appliquer (celles cochées à l'aperçu). */
  sheets: z.array(z.string().min(1)).min(1),
});
export type ImportApplyInput = z.infer<typeof importApplySchema>;
