import ExcelJS from "exceljs";
import {
  classifySize,
  qualityFromLabel,
  sawnVolumeM3,
  suiviColumnKey,
  type Quality,
  type StockImportIssue,
  type StockImportSheetDTO,
  type StockMovementKind,
} from "@ste/shared";
import { findLayout, num, readGrid, sheetDate, text, type Cell } from "./parse.js";

// ── Import d'un classeur au format STOCK ───────────────────────────────
// Lit tout tableau N° · LONGUEUR (FEET) · LARGEUR (INCH) · EPAISSEUR (INCH)
// · NBR DELIGNE (+ PRODUITS / GRADE) : le classeur STOCK du client, l'export
// STOCK de la plateforme, un DEBITES ou un EMPOTAGES.
// Le classeur STOCK du client porte sous la saisie un « RECAPITULATIF DE
// STOCK DISPONIBLE » (5 678 lignes SUMIFS) : on s'arrête à son titre, sinon
// tout serait compté deux fois. NBR DELIGNE peut être négatif (une pièce
// retirée) : les lignes d'une même dimension se compensent.

export type StockImportLine = {
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  quality: Quality;
  count: number;
};

export type StockImportSheet = StockImportSheetDTO & { lines: StockImportLine[] };

/** Fin du tableau de saisie : récapitulatif, second en-tête, pied (TOTAL / MAX / MIN). */
function isStop(line: Cell[] | undefined, nCol: number): boolean {
  if (!line) return false;
  const n = line[nCol];
  if (typeof n === "string" && /^(total|max|min|n°|no)$/i.test(n.trim())) return true;
  return line.some((v) => typeof v === "string" && /r[ée]capitulatif/i.test(v));
}

function dec(n: number): string {
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function readSheet(ws: ExcelJS.Worksheet, kind: StockMovementKind): StockImportSheet {
  const grid = readGrid(ws);
  const titleText = grid
    .slice(0, 6)
    .flatMap((l) => (l ?? []).filter((v): v is string => typeof v === "string"))
    .join(" | ");
  const layout = findLayout(grid, titleText);
  const date = sheetDate(ws.name) ?? null;
  const empty = (issues: StockImportIssue[]): StockImportSheet => ({
    name: ws.name,
    usable: false,
    date,
    lineCount: 0,
    pieceCount: 0,
    totalM3: "0.000000",
    byColumn: {},
    issues,
    lines: [],
  });
  if (!layout || layout.col.c === undefined) {
    return empty([
      {
        level: "error",
        message:
          "Pas de tableau LONGUEUR (FEET) · LARGEUR (INCH) · EPAISSEUR (INCH) sur cette feuille — ignorée",
      },
    ]);
  }
  const { col } = layout;
  const thickCol = layout.col.c;
  const issues: StockImportIssue[] = [];

  let end = grid.length;
  for (let r = layout.headerRow + 1; r < grid.length; r++) {
    if (isStop(grid[r], col.n)) {
      end = r;
      break;
    }
  }
  // Une ligne sans N° après la dernière numérotée = pied (sommes, MAX / MIN).
  let lastNumbered = -1;
  for (let r = layout.headerRow + 1; r < end; r++) {
    if (num(grid[r]?.[col.n] ?? null) !== null) lastNumbered = r;
  }

  // Lignes compensées par dimension + qualité.
  const net = new Map<string, StockImportLine & { rows: number[] }>();
  let negatives = 0;
  let positives = 0;
  for (let r = layout.headerRow + 1; r < end; r++) {
    const line = grid[r];
    if (!line) continue;
    const n = num(line[col.n] ?? null);
    if (n === null && r > lastNumbered) continue;
    const L = num(line[col.a] ?? null);
    const w = num(line[col.b] ?? null);
    const t = num(line[thickCol] ?? null);
    const label = n !== null ? `Ligne ${n}` : `Ligne sans N° (ligne ${r + 1} du classeur)`;
    if (L === null && w === null && t === null) continue; // ligne prénumérotée vierge
    if (L === null || w === null || t === null) {
      issues.push({ level: "warning", row: r + 1, message: `${label} : mesure manquante, ignorée` });
      continue;
    }
    if (L <= 0 || w <= 0 || t <= 0) {
      issues.push({ level: "warning", row: r + 1, message: `${label} : mesure nulle ou négative, ignorée` });
      continue;
    }
    const raw = col.count !== undefined ? num(line[col.count] ?? null) : 1;
    const cnt = raw === null ? 0 : Math.round(raw);
    if (cnt === 0) continue; // dimension listée sans pièce
    if (cnt < 0) negatives++;
    else positives++;
    const quality = qualityFromLabel(col.grade !== undefined ? text(line[col.grade] ?? null) : "");
    const key = `${L}x${w}x${t}:${quality}`;
    const acc = net.get(key);
    // Sorties : le classeur peut écrire les pièces retirées en négatif (convention
    // du tableau STOCK) — elles sortent toutes ; l'inventaire, lui, compense.
    const signed = kind === "INVENTAIRE" ? cnt : Math.abs(cnt);
    if (acc) {
      acc.count += signed;
      acc.rows.push(r + 1);
    } else {
      net.set(key, {
        lengthFt: dec(L),
        widthIn: dec(w),
        thicknessIn: dec(t),
        quality,
        count: signed,
        rows: [r + 1],
      });
    }
  }
  if (kind !== "INVENTAIRE" && negatives > 0 && positives > 0) {
    issues.push({
      level: "warning",
      message: `Nombres positifs et négatifs mélangés : les ${negatives + positives} lignes sont comptées comme sorties`,
    });
  }

  const lines: StockImportLine[] = [];
  for (const l of net.values()) {
    if (l.count < 0) {
      issues.push({
        level: "warning",
        row: l.rows[0],
        message: `${l.lengthFt} ft × ${l.widthIn} × ${l.thicknessIn} : solde négatif (${l.count}) dans l'inventaire, ignoré`,
      });
      continue;
    }
    if (l.count === 0) continue;
    const { rows: _rows, ...line } = l;
    lines.push(line);
  }

  let m3 = 0;
  let pieces = 0;
  const by: Record<string, number> = {};
  for (const l of lines) {
    const v = sawnVolumeM3(Number(l.lengthFt), Number(l.widthIn), Number(l.thicknessIn), l.count);
    m3 += v;
    pieces += l.count;
    const k = suiviColumnKey(Number(l.widthIn), Number(l.thicknessIn), l.quality);
    by[k] = (by[k] ?? 0) + v;
  }
  if (lines.length === 0) {
    issues.push({ level: "error", message: "Aucune pièce lisible (NBR DELIGNE vide ou nul)" });
  }
  return {
    name: ws.name,
    usable: lines.length > 0,
    date,
    lineCount: lines.length,
    pieceCount: pieces,
    totalM3: m3.toFixed(6),
    byColumn: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.toFixed(6)])),
    issues,
    lines,
  };
}

export async function parseStockWorkbook(
  buffer: Buffer,
  kind: StockMovementKind
): Promise<StockImportSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb.worksheets.map((ws) => readSheet(ws, kind));
}

/** Lignes prêtes pour `StockMovementLine` (F3 / F4 côté serveur). */
export function movementLines(lines: StockImportLine[]) {
  return lines.map((l, i) => {
    const size = classifySize(Number(l.widthIn), Number(l.thicknessIn));
    return {
      position: i + 1,
      lengthFt: l.lengthFt,
      widthIn: l.widthIn,
      thicknessIn: l.thicknessIn,
      count: l.count,
      quality: l.quality,
      sizeCode: size.code,
      sizeGroup: size.group,
      volumeM3: sawnVolumeM3(
        Number(l.lengthFt),
        Number(l.widthIn),
        Number(l.thicknessIn),
        l.count
      ).toFixed(6),
    };
  });
}
