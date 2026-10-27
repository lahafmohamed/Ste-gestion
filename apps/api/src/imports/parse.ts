import ExcelJS from "exceljs";
import type { ImportIssue, ImportSheetMeta, ImportSheetType } from "@ste/shared";

// ── Lecture des classeurs terrain ───────────────────────────────────────
// Quatre gabarits, reconnus par leurs en-têtes (pas par le nom du fichier) :
//   DIAMETRE  : Log# · Length · Dia · Volume · CFT · N° BILL      → relevé Ø
//   GIRTH     : Log# · Length · Circ · Vol G · Num logs           → billonnage
//   DEBITES   : N° · LONGUEUR (FEET) · LARGEUR (INCH) · EPAISSEUR (INCH) · NBR DELIGNE · VOLUME · FEUIL
//   EMPOTAGES : N° · PRODUITS · mêmes mesures · FEUIL, titre « EMPOTAGE TECK » + n° conteneur
// Gabarits 09-2026 : lignes prénumérotées (N° repart à 1 à chaque FEUIL,
// NBR DELIGNE et FEUIL préremplis) — une ligne sans mesure est une ligne
// vierge, pas une erreur. Pied de tableau : Total / MAX / MIN. Une ligne
// insérée sans N° entre deux lignes numérotées compte (avec avertissement).
// Les métadonnées (immat, B/L, cubage brousse, contrat, plomb, totaux) sont
// écrites en marge, à droite du tableau : on balaie toutes les cellules.

export type RawRow = {
  /** N° de ligne dans la feuille (pour les messages). */
  row: number;
  /** N° du classeur — absent sur une ligne insérée sans être numérotée. */
  n?: number;
  id?: string;
  a: number;
  b: number;
  c?: number;
  count?: number;
  /** Colonne GRADE (famille de sciage tenue à la main), si la feuille en a une. */
  grade?: string;
  /** Colonne FEUIL : n° de la feuille papier (le N° repart à 1 à chaque feuille). */
  page?: number;
  excelM3?: number;
};

export type ParsedSheet = {
  name: string;
  type: ImportSheetType;
  meta: ImportSheetMeta;
  rows: RawRow[];
  issues: ImportIssue[];
};

type Cell = string | number | null;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return null;
}

function num(v: Cell): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function text(v: Cell): string {
  return v === null ? "" : String(v).trim();
}

/** Grille brute d'une feuille : grid[r][c] (0-based), trous = null. */
function readGrid(ws: ExcelJS.Worksheet): Cell[][] {
  const grid: Cell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    const line: Cell[] = [];
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      line[c - 1] = cellValue(cell.value);
    });
    grid[r - 1] = line;
  });
  return grid;
}

// ── Détection du gabarit par la ligne d'en-tête ─────────────────────────

type Layout = {
  type: Exclude<ImportSheetType, "UNKNOWN">;
  headerRow: number;
  col: {
    n: number;
    a: number;
    b: number;
    c?: number;
    count?: number;
    id?: number;
    grade?: number;
    page?: number;
    excelM3?: number;
  };
};

const H = {
  logNo: /^(log\s*#|n°|no|num)$/i,
  length: /^(length|longueur)/i,
  dia: /^dia/i,
  circ: /^circ/i,
  volume: /^(volume|vol\s*g|vol)/i,
  bill: /bill|num\s*logs?/i,
  width: /^largeur/i,
  thick: /^epaisseur|^épaisseur/i,
  count: /^nbr|^nombre|^qt/i,
  grade: /^(grade|produits?)$/i,
  page: /^feuil/i,
};

function findLayout(grid: Cell[][], titleText: string): Layout | null {
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const line = grid[r] ?? [];
    const idx = (re: RegExp) => line.findIndex((v) => typeof v === "string" && re.test(v.trim()));
    const nCol = idx(H.logNo);
    if (nCol < 0) continue;
    const lenCol = idx(H.length);
    if (lenCol < 0) continue;

    const diaCol = idx(H.dia);
    const circCol = idx(H.circ);
    const widthCol = idx(H.width);
    const thickCol = idx(H.thick);
    const volCol = idx(H.volume);
    const billCol = idx(H.bill);
    const countCol = idx(H.count);
    const gradeCol = idx(H.grade);
    const pageCol = idx(H.page);

    if (diaCol >= 0) {
      return {
        type: "YARD_DIAMETER",
        headerRow: r,
        col: {
          n: nCol,
          a: lenCol,
          b: diaCol,
          id: billCol >= 0 ? billCol : undefined,
          excelM3: volCol >= 0 ? volCol : undefined,
        },
      };
    }
    if (circCol >= 0) {
      return {
        type: "YARD_GIRTH",
        headerRow: r,
        col: {
          n: nCol,
          a: lenCol,
          b: circCol,
          id: billCol >= 0 ? billCol : undefined,
          excelM3: volCol >= 0 ? volCol : undefined,
        },
      };
    }
    if (widthCol >= 0 && thickCol >= 0) {
      const isContainer = /EMPOTAGE/i.test(titleText);
      return {
        type: isContainer ? "CONTAINER" : "SAWN",
        headerRow: r,
        col: {
          n: nCol,
          a: lenCol,
          b: widthCol,
          c: thickCol,
          count: countCol >= 0 ? countCol : undefined,
          grade: gradeCol >= 0 ? gradeCol : undefined,
          page: pageCol >= 0 ? pageCol : undefined,
          excelM3: volCol >= 0 ? volCol : undefined,
        },
      };
    }
  }
  return null;
}

// ── Métadonnées en marge ────────────────────────────────────────────────

function sheetDate(name: string): string | undefined {
  const m = name.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  // Midi local : évite le décalage de jour au passage en UTC (même règle que
  // la réception).
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00`;
}

function decimalText(n: number, digits = 3): string {
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

function tableEnd(layout: Layout | null): number {
  if (!layout) return 6;
  return Math.max(...Object.values(layout.col).filter((x): x is number => x !== undefined));
}

function readMeta(
  grid: Cell[][],
  name: string,
  type: ImportSheetType,
  marginFrom: number,
): ImportSheetMeta {
  const meta: ImportSheetMeta = {};
  const date = sheetDate(name);
  if (date) meta.date = date;

  // Toutes les cellules texte, avec la valeur numérique qui suit à droite (les
  // libellés « VOL-DIA = » ont leur chiffre dans la cellule suivante).
  const cells: { r: number; c: number; s: string; next: number | null; sameRowNums: number[] }[] =
    [];
  grid.forEach((line, r) => {
    if (!line) return;
    line.forEach((v, c) => {
      if (typeof v !== "string" || v.trim() === "") return;
      let next: number | null = null;
      for (let k = c + 1; k < line.length && k <= c + 3; k++) {
        const n = num(line[k] ?? null);
        if (n !== null) {
          next = n;
          break;
        }
      }
      const sameRowNums = line
        .slice(c + 1)
        .map((x) => num(x ?? null))
        .filter((x): x is number => x !== null);
      cells.push({ r, c, s: v.trim(), next, sameRowNums });
    });
  });

  // Le nom de la feuille compte aussi (n° conteneur « MRKU 684202-0 DU 08-05-2026 »).
  cells.push({ r: -1, c: -1, s: name.trim(), next: null, sameRowNums: [] });

  // Libellés de marge connus : tout autre texte en capitales, sans chiffre,
  // est la provenance (KASSA, SANGOUE…) écrite seule dans la colonne H.
  const KNOWN =
    /camion|cub|cbm|b\s*\/?\s*l\b|vol|debite|débité|rend|parc|plomb|nbre|poids|n°|feuil|total|average|girth|max|min|circonference|tableau|stock|empotage|teck|eme$/i;

  for (const { r, c, s, next, sameRowNums } of cells) {
    let m: RegExpMatchArray | null;
    if (!meta.registration && (m = s.match(/^camion\s+(.+)$/i))) meta.registration = m[1].trim();
    if (!meta.deliveryNote) {
      if ((m = s.match(/\bB\s*\/?\s*L\b\s*[:=]?\s*(\d{3,})/i))) meta.deliveryNote = m[1];
      // « B/L : » seul, le numéro dans la cellule voisine.
      else if (/^B\s*\/?\s*L\b\s*[:=]?\s*$/i.test(s) && next !== null && Number.isInteger(next))
        meta.deliveryNote = String(next);
    }
    if (!meta.declaredFieldM3) {
      if ((m = s.match(/(cub(?:age)?\s*brousse|cbm)\s*[:=]?\s*([\d\s.,]*\d[\d\s.,]*)\s*m/i))) {
        const n = num(m[2]);
        if (n !== null) meta.declaredFieldM3 = decimalText(n);
      } else if (/^(cub(?:age)?\s*brousse|cbm)\s*[:=]?\s*(m³|m3)?\s*$/i.test(s) && next !== null) {
        meta.declaredFieldM3 = decimalText(next);
      }
    }
    if (!meta.contractCode && (m = s.match(/\b([A-Z]\d-\d{4}-\d{3})\b/))) meta.contractCode = m[1];
    if (!meta.parcel && (m = s.match(/^parcelle\s*[:=]?\s*(.+)$/i))) meta.parcel = m[1].trim();
    if (!meta.containerNo && (m = s.match(/\b([A-Z]{4})\s?(\d{6})\s*[/-]\s*(\d)\b/))) {
      meta.containerNo = `${m[1]} ${m[2]}/${m[3]}`;
      const g = s.match(/\(([^)]*)\)/);
      if (g && !meta.grade) meta.grade = g[1].trim();
    }
    if (!meta.sealNo && (m = s.match(/plomb\s*[:=]?\s*([A-Z0-9][A-Z0-9 \-/]*)/i))) {
      const seal = m[1].trim();
      // « N°PLOMB = ML-CI » : préfixe seul, le numéro dans la cellule voisine ;
      // sans numéro nulle part, pas de plomb.
      if (/\d/.test(seal)) meta.sealNo = seal;
      else if (next !== null) meta.sealNo = `${seal} ${next}`;
    }
    if (!meta.excelPieceCount && /^nbre?\s*elm/i.test(s) && next !== null)
      meta.excelPieceCount = Math.round(next);
    if (!meta.excelTotalM3) {
      const plain = !/[≥<>]/.test(s); // pas les sous-totaux « VOL-G ≥85 »
      if (type === "YARD_DIAMETER" && plain && /vol\s*-?\s*dia/i.test(s) && next !== null)
        meta.excelTotalM3 = decimalText(next);
      if (type === "YARD_GIRTH" && plain && /vol\s*-?\s*g\b/i.test(s) && next !== null)
        meta.excelTotalM3 = decimalText(next);
      if ((type === "SAWN" || type === "CONTAINER") && /^debite$/i.test(s) && sameRowNums.length) {
        meta.excelTotalM3 = decimalText(sameRowNums[sameRowNums.length - 1]);
      }
    }
    // Provenance : feuilles d'étalage seulement, dans la marge à droite du tableau.
    if (
      !meta.origin &&
      (type === "YARD_DIAMETER" || type === "YARD_GIRTH") &&
      r >= 0 &&
      c >= marginFrom &&
      /^[A-ZÉÈ][A-ZÉÈ' -]{2,}$/.test(s) &&
      !KNOWN.test(s)
    )
      meta.origin = s;
  }
  return meta;
}

// ── Lignes ──────────────────────────────────────────────────────────────

function readRows(grid: Cell[][], layout: Layout, issues: ImportIssue[]): RawRow[] {
  const rows: RawRow[] = [];
  const { col } = layout;
  const isFooter = (v: Cell) => typeof v === "string" && /^(total|max|min)$/i.test(v.trim());
  // Dernière ligne numérotée : une ligne sans n° placée avant a été insérée à
  // la main sans être numérotée — elle compte ; après, c'est le pied de tableau
  // (MAX / MIN des DEBITES ont des mesures mais leur libellé hors colonne N°).
  let lastNumbered = -1;
  for (let r = layout.headerRow + 1; r < grid.length; r++) {
    const nCell = grid[r]?.[col.n] ?? null;
    if (isFooter(nCell)) break;
    if (num(nCell) !== null) lastNumbered = r;
  }
  let prevN: number | undefined;
  for (let r = layout.headerRow + 1; r < grid.length; r++) {
    const line = grid[r];
    if (!line) continue;
    const nCell = line[col.n] ?? null;
    // Pied de tableau (Total / MAX / MIN) : fin des mesures.
    if (isFooter(nCell)) break;
    const n = num(nCell);
    const a = num(line[col.a] ?? null);
    const b = num(line[col.b] ?? null);
    const c = col.c !== undefined ? num(line[col.c] ?? null) : null;
    // Messages : le N° du classeur, ou la ligne Excel quand il manque.
    const after = prevN !== undefined ? `, après le n° ${prevN}` : "";
    const label = n !== null ? `Ligne ${n}` : `Ligne sans N° (ligne ${r + 1} du classeur${after})`;
    if (n !== null) prevN = n;
    // Pied de tableau ou ligne vide : pas de n° → ignorée sans bruit.
    if (n === null && r > lastNumbered) continue;
    // Ligne prénumérotée du gabarit laissée vierge (NBR / FEUIL préremplis,
    // aucune mesure) : pas une erreur.
    if (a === null && b === null && c === null) continue;
    if (a === null || b === null) {
      issues.push({
        level: "warning",
        row: r + 1,
        message: `${label} : mesure manquante, ignorée`,
      });
      continue;
    }
    const row: RawRow = { row: r + 1, a, b };
    if (n !== null) row.n = n;
    if (col.id !== undefined) {
      const id = text(line[col.id] ?? null);
      if (id) row.id = id;
    }
    if (col.c !== undefined) {
      if (c === null) {
        issues.push({
          level: "warning",
          row: r + 1,
          message: `${label} : épaisseur manquante, ignorée`,
        });
        continue;
      }
      row.c = c;
    }
    if (col.count !== undefined) {
      const cnt = num(line[col.count] ?? null);
      row.count = cnt === null ? 1 : Math.round(cnt);
      if (row.count < 1) {
        issues.push({
          level: "warning",
          row: r + 1,
          message: `${label} : nombre de pièces nul, ignorée`,
        });
        continue;
      }
    }
    if (col.grade !== undefined) {
      const g = text(line[col.grade] ?? null);
      if (g) row.grade = g;
    }
    if (col.page !== undefined) {
      const p = num(line[col.page] ?? null);
      if (p !== null) row.page = Math.round(p);
    }
    if (col.excelM3 !== undefined) {
      const v = num(line[col.excelM3] ?? null);
      if (v !== null) row.excelM3 = v;
    }
    if (a <= 0 || b <= 0 || (row.c !== undefined && row.c <= 0)) {
      issues.push({
        level: "warning",
        row: r + 1,
        message: `${label} : mesure nulle ou négative, ignorée`,
      });
      continue;
    }
    if (n === null) issues.push({ level: "warning", row: r + 1, message: `${label} : importée` });
    rows.push(row);
  }
  // Ligne de total en bas du tableau : N° = nombre de lignes, mesures = moyennes,
  // volume = somme. Elle n'a pas de n° de bille et son volume vaut la somme
  // des précédentes — on la reconnaît à ça et on l'écarte.
  const last = rows[rows.length - 1];
  if (last && rows.length > 1 && last.excelM3 !== undefined && !last.id) {
    const sumPrev = rows.slice(0, -1).reduce((acc, r) => acc + (r.excelM3 ?? 0), 0);
    if (sumPrev > 0 && Math.abs(last.excelM3 - sumPrev) / sumPrev < 0.01) rows.pop();
  }
  return rows;
}

/** B/L écrit sans libellé : entier de 5 à 7 chiffres en marge, à droite du tableau. */
function bareDeliveryNote(grid: Cell[][], layout: Layout): string | undefined {
  const from = tableEnd(layout) + 1;
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    const line = grid[r] ?? [];
    for (let c = from; c < line.length; c++) {
      const v = line[c];
      if (typeof v === "number" && Number.isInteger(v) && v >= 10000 && v <= 9999999)
        return String(v);
      if (typeof v === "string" && /^\d{5,7}$/.test(v.trim())) return v.trim();
    }
  }
  return undefined;
}

/** Lit un classeur (.xlsx en mémoire) et rend une entrée par feuille. */
export async function parseWorkbook(buffer: Buffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const out: ParsedSheet[] = [];
  for (const ws of wb.worksheets) {
    const grid = readGrid(ws);
    const titleText = grid
      .slice(0, 6)
      .flatMap((l) => (l ?? []).filter((v): v is string => typeof v === "string"))
      .join(" | ");
    const layout = findLayout(grid, titleText);
    if (!layout) {
      out.push({
        name: ws.name,
        type: "UNKNOWN",
        meta: readMeta(grid, ws.name, "UNKNOWN", tableEnd(null) + 1),
        rows: [],
        issues: [
          {
            level: "error",
            message:
              "Pas de tableau de mesures sur cette feuille (résumé, notes…) — ignorée. Attendu : Log#/Length/Dia, Log#/Length/Circ ou N°/LONGUEUR/LARGEUR/EPAISSEUR",
          },
        ],
      });
      continue;
    }
    const issues: ImportIssue[] = [];
    const rows = readRows(grid, layout, issues);
    const meta = readMeta(grid, ws.name, layout.type, tableEnd(layout) + 1);
    // B/L sans libellé : feuilles camion seulement (sur un empotage, l'entier
    // en marge est le n° de plomb).
    if (!meta.deliveryNote && layout.type !== "CONTAINER") {
      const bl = bareDeliveryNote(grid, layout);
      if (bl) meta.deliveryNote = bl;
    }
    if (layout.type === "CONTAINER" && !meta.grade) {
      // Pas de grade dans le titre : colonne PRODUITS uniforme → grade du conteneur.
      const grades = new Set(rows.map((r) => r.grade).filter((g): g is string => !!g));
      if (grades.size === 1) meta.grade = [...grades][0];
    }
    if (rows.length === 0)
      issues.push({ level: "error", message: "Aucune ligne de mesure lisible" });
    out.push({ name: ws.name, type: layout.type, meta, rows, issues });
  }
  return out;
}
