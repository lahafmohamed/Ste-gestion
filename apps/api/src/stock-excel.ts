import ExcelJS from "exceljs";
import {
  LEDGER_KIND_EXCEL,
  suiviColumnLabel,
  type StockLedgerDTO,
  type StockRowDTO,
} from "@ste/shared";

// ── Classeurs STOCK et SUIVI, mise en page du client ──────────────────
// STOCK : B « N° » · C « PRODUITS » · D-F dimensions · G « NBR DELIGNE » ·
// H « VOLUME (m3) » en formule (L×l×ép/144/35.315×N), comme son tableau.
// Il se relit tel quel à l'import (PRODUITS = qualité, pied « TOTAL »).
// SUIVI : Date · DESIGNATION · N° CBG · VOL PROD · une colonne par produit,
// ligne de total en SUM. Les formules portent leur résultat : le classeur
// s'affiche juste même sans recalcul (aperçu mobile, import).

const M3 = "0.000";

function title(ws: ExcelJS.Worksheet, range: string, text: string) {
  ws.mergeCells(range);
  const cell = ws.getCell(range.split(":")[0]);
  cell.value = text;
  cell.font = { bold: true, size: 16 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function header(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.height = 32;
}

function frDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** Date Excel sans heure (minuit UTC = minuit à Abidjan). */
function excelDate(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function stockWorkbook(rows: StockRowDTO[], at: Date): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`STOCK DU ${frDate(at)}`);
  title(ws, "B1:H2", "TABLEAU DE STOCK");
  ws.getCell("B3").value = `Stock au ${frDate(at).replace(/-/g, "/")}`;
  ws.getCell("B3").font = { italic: true };

  const hr = ws.getRow(4);
  ["N°", "PRODUITS", "LONGUEUR (FEET)", "LARGEUR (INCH)", "EPAISSEUR (INCH)", "NBR DELIGNE", "VOLUME (m3)"].forEach(
    (h, i) => (hr.getCell(2 + i).value = h)
  );
  header(hr);

  const lines = rows.filter((r) => r.stockCount !== 0);
  let r = 5;
  let pieces = 0;
  let m3 = 0;
  lines.forEach((l, i) => {
    const vol = Number(l.stockM3);
    pieces += l.stockCount;
    m3 += vol;
    const row = ws.getRow(r);
    row.getCell(2).value = i + 1;
    row.getCell(3).value = suiviColumnLabel(l.suiviKey);
    row.getCell(4).value = Number(l.lengthFt);
    row.getCell(5).value = Number(l.widthIn);
    row.getCell(6).value = Number(l.thicknessIn);
    row.getCell(7).value = l.stockCount;
    row.getCell(8).value = { formula: `D${r}*E${r}*F${r}/144/35.315*G${r}`, result: vol };
    row.getCell(8).numFmt = "0.000000";
    r++;
  });
  const last = r - 1;
  const foot = ws.getRow(r);
  foot.getCell(2).value = "TOTAL";
  foot.getCell(7).value = lines.length ? { formula: `SUM(G5:G${last})`, result: pieces } : 0;
  foot.getCell(8).value = lines.length ? { formula: `SUM(H5:H${last})`, result: m3 } : 0;
  foot.getCell(8).numFmt = M3;
  foot.font = { bold: true };

  [4, 6, 14, 12, 12, 12, 12, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 4 }];

  // Récapitulatif par produit (colonnes du suivi) — feuille à part : elle n'a
  // pas de dimensions, l'import l'écarte.
  const rec = wb.addWorksheet("RECAP PAR PRODUIT");
  title(rec, "A1:C2", "RECAPITULATIF DE STOCK DISPONIBLE");
  const rh = rec.getRow(4);
  ["PRODUITS", "NBR DELIGNE", "VOLUME (m3)"].forEach((h, i) => (rh.getCell(1 + i).value = h));
  header(rh);
  const byProduct = new Map<string, { pieces: number; m3: number }>();
  for (const l of lines) {
    const label = suiviColumnLabel(l.suiviKey);
    const acc = byProduct.get(label) ?? { pieces: 0, m3: 0 };
    acc.pieces += l.stockCount;
    acc.m3 += Number(l.stockM3);
    byProduct.set(label, acc);
  }
  let rr = 5;
  for (const [label, v] of byProduct) {
    const row = rec.getRow(rr++);
    row.getCell(1).value = label;
    row.getCell(2).value = v.pieces;
    row.getCell(3).value = v.m3;
    row.getCell(3).numFmt = M3;
  }
  const rf = rec.getRow(rr);
  rf.getCell(1).value = "TOTAL";
  rf.getCell(2).value = byProduct.size ? { formula: `SUM(B5:B${rr - 1})`, result: pieces } : 0;
  rf.getCell(3).value = byProduct.size ? { formula: `SUM(C5:C${rr - 1})`, result: m3 } : 0;
  rf.getCell(3).numFmt = M3;
  rf.font = { bold: true };
  [16, 14, 14].forEach((w, i) => (rec.getColumn(i + 1).width = w));
  return wb;
}

export function suiviWorkbook(ledger: StockLedgerDTO): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("SUIVI");
  const firstCol = 5; // E
  const lastCol = firstCol + ledger.columns.length - 1;
  title(ws, `A1:${colLetter(Math.max(lastCol, 4))}3`, "SUIVI PAR EPAISSEURS");

  const hr = ws.getRow(5);
  ["Date", "DESIGNATION", "N° CBG", "VOL PROD", ...ledger.columns.map((c) => c.label)].forEach(
    (h, i) => (hr.getCell(1 + i).value = h)
  );
  header(hr);

  let r = 6;
  for (const row of ledger.rows) {
    const x = ws.getRow(r++);
    x.getCell(1).value = excelDate(row.date);
    x.getCell(1).numFmt = "dd/mm/yyyy";
    x.getCell(2).value = LEDGER_KIND_EXCEL[row.kind];
    x.getCell(3).value = row.reference ?? null;
    x.getCell(4).value = Number(row.volumeM3);
    x.getCell(4).numFmt = M3;
    ledger.columns.forEach((c, i) => {
      const v = row.byColumn[c.key];
      if (v === undefined || Math.abs(Number(v)) < 5e-7) return;
      const cell = x.getCell(firstCol + i);
      cell.value = Number(v);
      cell.numFmt = M3;
    });
  }
  const last = r - 1;
  const foot = ws.getRow(r);
  foot.getCell(1).value = "STOCK";
  const sumCell = (col: number, result: number) => {
    const L = colLetter(col);
    const cell = foot.getCell(col);
    cell.value = last >= 6 ? { formula: `SUM(${L}6:${L}${last})`, result } : 0;
    cell.numFmt = M3;
  };
  sumCell(4, Number(ledger.totals.volumeM3));
  ledger.columns.forEach((c, i) =>
    sumCell(firstCol + i, Number(ledger.totals.byColumn[c.key] ?? 0))
  );
  foot.font = { bold: true };

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 11;
  for (let c = firstCol; c <= lastCol; c++) ws.getColumn(c).width = 10;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 5 }];
  return wb;
}
