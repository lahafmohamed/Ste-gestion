import type { FastifyInstance, FastifyReply } from "fastify";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import type { SizeGroup } from "@ste/shared";
import {
  GIRTH_SPLIT_CM,
  LONG_SPLIT_FT,
  M3_TO_CFT,
  SIZE_GROUP_LABELS,
  billCount,
  sizeSortIndex,
  truckSawnProgress,
} from "@ste/shared";
import { prisma } from "../prisma.js";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function send(reply: FastifyReply, wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  reply
    .type(XLSX_MIME)
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(Buffer.from(buf));
}

function headerStyle(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
}

function boldRow(row: ExcelJS.Row) {
  row.font = { bold: true };
}

// ── Classeurs au format des gabarits terrain (09-2026) ──────────────
// Même mise en page que DIAMETRE / GIRTH / DEBITES / EMPOTAGES : ce qui sort
// d'ici se relit à l'import (/import) et se lit comme la feuille papier.

/** « 03-09-2026 » (date locale, pas de décalage UTC). */
function frDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Lignes par feuille papier (gabarit DEBITES : le N° repart à 1 à chaque FEUIL). */
const PAGE_ROWS = 92;

function sheetName(wb: ExcelJS.Workbook, base: string): string {
  const clean = base.replace(/[\\/?*[\]:]/g, "-").slice(0, 28);
  let name = clean;
  for (let i = 2; wb.getWorksheet(name); i++) name = `${clean} ${i}`;
  return name;
}

function n3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function put(ws: ExcelJS.Worksheet, addr: string, v: ExcelJS.CellValue, bold = false) {
  const c = ws.getCell(addr);
  c.value = v;
  if (bold) c.font = { bold: true };
}

function minMax(vals: number[]): [number, number] {
  return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 0];
}

function avg(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

type TruckLogs = {
  declaredFieldM3: Prisma.Decimal | null;
  measurements: { context: string; logs: { volumeM3: Prisma.Decimal }[] }[];
};

function sumLogs(t: TruckLogs, context: string): number {
  return t.measurements
    .filter((m) => m.context === context)
    .reduce((s, m) => s + m.logs.reduce((x, l) => x + Number(l.volumeM3), 0), 0);
}

/** Cubage brousse : déclaré à la réception, sinon relevé FIELD. */
function fieldM3(t: TruckLogs): number {
  if (t.declaredFieldM3) return Number(t.declaredFieldM3);
  return sumLogs(t, "FIELD");
}

/** Cubage parc : girth (billons), sinon diamètre. */
function yardM3(t: TruckLogs): number {
  return sumLogs(t, "YARD_GIRTH") || sumLogs(t, "YARD_DIAMETER");
}

type SawnLike = {
  lengthFt: Prisma.Decimal;
  widthIn: Prisma.Decimal;
  thicknessIn: Prisma.Decimal;
  count: number;
  volumeM3: Prisma.Decimal;
  sizeGroup: string;
};

/**
 * Tableau N° / LONGUEUR / LARGEUR / EPAISSEUR / NBR DELIGNE / VOLUME / FEUIL à
 * partir de `firstCol` (A pour débité, B pour empotage — colonne PRODUITS en
 * plus). Pied : pièces + volume, puis MAX / MIN.
 */
function writeSawnTable(
  ws: ExcelJS.Worksheet,
  lines: SawnLike[],
  opts: { firstCol: number; headerRow: number; product?: string },
): { total: number; pieces: number } {
  const c0 = opts.firstCol;
  const off = opts.product !== undefined ? 1 : 0;
  const head = ["N°"];
  if (opts.product !== undefined) head.push("PRODUITS");
  head.push(
    "LONGUEUR (FEET)",
    "LARGEUR (INCH)",
    "EPAISSEUR (INCH)",
    "NBR DELIGNE",
    "VOLUME (m3)",
    "FEUIL",
  );
  const hr = ws.getRow(opts.headerRow);
  head.forEach((h, i) => (hr.getCell(c0 + i).value = h));
  headerStyle(hr);

  let total = 0;
  let pieces = 0;
  const L: number[] = [];
  const W: number[] = [];
  const T: number[] = [];
  const V: number[] = [];
  let r = opts.headerRow + 1;
  lines.forEach((l, i) => {
    const v = Number(l.volumeM3);
    total += v;
    pieces += l.count;
    L.push(Number(l.lengthFt));
    W.push(Number(l.widthIn));
    T.push(Number(l.thicknessIn));
    V.push(v);
    const vals: ExcelJS.CellValue[] = [(i % PAGE_ROWS) + 1];
    if (opts.product !== undefined) vals.push(opts.product);
    vals.push(
      Number(l.lengthFt),
      Number(l.widthIn),
      Number(l.thicknessIn),
      l.count,
      n3(v),
      Math.floor(i / PAGE_ROWS) + 1,
    );
    const row = ws.getRow(r++);
    vals.forEach((x, k) => (row.getCell(c0 + k).value = x));
  });
  const foot = ws.getRow(r++);
  foot.getCell(c0 + off + 4).value = pieces;
  foot.getCell(c0 + off + 5).value = n3(total);
  foot.font = { bold: true };
  r++;
  const [minL, maxL] = minMax(L);
  const [minW, maxW] = minMax(W);
  const [minT, maxT] = minMax(T);
  const [minV, maxV] = minMax(V);
  const mx = ws.getRow(r++);
  const mn = ws.getRow(r++);
  mx.getCell(c0).value = "MAX";
  mn.getCell(c0).value = "MIN";
  [maxL, maxW, maxT, "", n3(maxV)].forEach((x, k) => (mx.getCell(c0 + off + 1 + k).value = x));
  [minL, minW, minT, "", n3(minV)].forEach((x, k) => (mn.getCell(c0 + off + 1 + k).value = x));
  return { total, pieces };
}

/** Résumé de sciage en marge (familles, long / court) à partir de `col` / `row`. */
function writeCuttingResume(ws: ExcelJS.Worksheet, lines: SawnLike[], col: string, row: number) {
  const groups: Record<SizeGroup, number> = { MAIN: 0, SIDE: 0, ONE_INCH: 0, OTHER: 0 };
  let total = 0;
  let longM3 = 0;
  for (const l of lines) {
    const v = Number(l.volumeM3);
    total += v;
    if (Number(l.lengthFt) >= LONG_SPLIT_FT) longM3 += v;
    groups[l.sizeGroup as SizeGroup] += v;
  }
  const valCol = String.fromCharCode(col.charCodeAt(0) + 2);
  put(ws, `${col}${row}`, "CUTTING RESUME", true);
  let r = row + 1;
  for (const g of ["MAIN", "SIDE", "ONE_INCH", "OTHER"] as SizeGroup[]) {
    if (groups[g] <= 0) continue;
    put(ws, `${col}${r}`, SIZE_GROUP_LABELS[g]);
    put(ws, `${valCol}${r}`, n3(groups[g]));
    r++;
  }
  put(ws, `${col}${r}`, `LONG ${LONG_SPLIT_FT} ft+`);
  put(ws, `${valCol}${r++}`, n3(longM3));
  put(ws, `${col}${r}`, "COURT");
  put(ws, `${valCol}${r++}`, n3(total - longM3));
}

function widths(ws: ExcelJS.Worksheet, w: number[]) {
  w.forEach((x, i) => (ws.getColumn(i + 1).width = x));
}

export async function exportRoutes(app: FastifyInstance) {
  // ── Étalage camion : une feuille par relevé, gabarit DIAMETRE / GIRTH ──
  app.get<{ Params: { id: string } }>("/trucks/:id/export.xlsx", async (req, reply) => {
    const t = await prisma.truck.findUnique({
      where: { id: req.params.id },
      include: {
        contract: { select: { code: true } },
        measurements: {
          orderBy: { createdAt: "asc" },
          include: { logs: { orderBy: { position: "asc" } } },
        },
      },
    });
    if (!t) return reply.code(404).send({ error: "Camion introuvable" });

    const wb = new ExcelJS.Workbook();
    const field = fieldM3(t);
    for (const m of t.measurements) {
      const date = frDate(m.measuredAt);
      const isDia = m.context === "YARD_DIAMETER";
      const base =
        m.context === "YARD_DIAMETER"
          ? `Etalage du ${date} A`
          : m.context === "YARD_GIRTH"
            ? `Girth du ${date} A`
            : `Brousse du ${date}`;
      const ws = wb.addWorksheet(sheetName(wb, base));
      const vols = m.logs.map((l) => Number(l.volumeM3));
      const total = vols.reduce((a, b) => a + b, 0);

      if (isDia) {
        // DIAMETRE : Log# · Length · Dia · Volume · CFT · N° BILL, marge en H.
        put(ws, "A1", `CAMION ${t.registration}`, true);
        ws.mergeCells("A1:E1");
        headerStyle(ws.addRow(["Log#", "Length", "Dia", "Volume", "CFT", "N° BILL"]));
        const Ls: number[] = [];
        const Ds: number[] = [];
        for (const l of m.logs) {
          const v = Number(l.volumeM3);
          Ls.push(Number(l.lengthFt));
          Ds.push(Number(l.diameterIn));
          ws.addRow([
            l.position,
            Number(l.lengthFt),
            Number(l.diameterIn),
            n3(v),
            n3(l.cft ? Number(l.cft) : v * M3_TO_CFT),
            l.externalId ?? "",
          ]);
        }
        boldRow(ws.addRow(["Total", "", "Average", "CBM", "Average"]));
        ws.addRow([m.logs.length, n3(avg(Ls)), n3(avg(Ds)), n3(total), n3(avg(vols) * M3_TO_CFT)]);
        ws.addRow([]);
        const [minL, maxL] = minMax(Ls);
        const [minD, maxD] = minMax(Ds);
        const [minV, maxV] = minMax(vols);
        ws.addRow(["MAX", maxL, maxD, n3(maxV)]);
        ws.addRow(["MIN", minL, minD, n3(minV)]);

        put(ws, "H4", `CUB BROUSSE : ${field ? n3(field) : ""} m³`);
        put(ws, "H5", `B/L : ${t.deliveryNote ?? ""}`);
        put(ws, "H7", "VOL-DIA = ");
        put(ws, "I7", n3(total), true);
        if (t.origin) put(ws, "H12", t.origin);
        put(ws, "H14", t.contract.code);
        if (t.parcel) put(ws, "H16", `PARCELLE ${t.parcel}`);
        widths(ws, [8, 10, 10, 12, 12, 10, 4, 22, 12]);
      } else {
        // GIRTH (billons) et brousse : Log# · Length · Circ · Vol G · Num logs.
        put(ws, "A1", `Camion ${t.registration}`, true);
        ws.mergeCells("A1:E1");
        put(ws, "B2", "CIRCONFERENCE", true);
        ws.mergeCells("B2:D2");
        const hr = ws.getRow(3);
        ["Log#", "Length", "Circ", "Vol G", "Num logs"].forEach(
          (h, i) => (hr.getCell(i + 1).value = h),
        );
        headerStyle(hr);
        const Ls: number[] = [];
        const Cs: number[] = [];
        let gte = 0;
        for (const l of m.logs) {
          const v = Number(l.volumeM3);
          Ls.push(Number(l.lengthM));
          Cs.push(Number(l.circumferenceCm));
          if (Number(l.circumferenceCm ?? 0) >= GIRTH_SPLIT_CM) gte += v;
          ws.addRow([
            l.position,
            Number(l.lengthM),
            Number(l.circumferenceCm),
            n3(v),
            l.externalId ?? "",
          ]);
        }
        boldRow(ws.addRow(["Total", "", "Girth", "CBM"]));
        ws.addRow([m.logs.length, n3(avg(Ls)), n3(avg(Cs)), n3(total)]);
        ws.addRow([]);
        const [minL, maxL] = minMax(Ls);
        const [minC, maxC] = minMax(Cs);
        const [minV, maxV] = minMax(vols);
        ws.addRow(["MAX", maxL, maxC, n3(maxV)]);
        ws.addRow(["MIN", minL, minC, n3(minV)]);

        put(ws, "H5", `CBM = ${field ? n3(field) : ""} m³`);
        put(ws, "H6", `BL ${t.deliveryNote ?? ""}`);
        put(ws, "H9", "VOL-G = ");
        put(ws, "I9", n3(total), true);
        if (m.context === "YARD_GIRTH") {
          put(ws, "H15", `VOL-G  ≥${GIRTH_SPLIT_CM} = ${n3(gte)} m3`);
          put(ws, "H19", `VOL-G < ${GIRTH_SPLIT_CM} = ${n3(total - gte)} m3`);
          // Billons issus du tronçonnage : rappel du nombre de billes mères.
          put(ws, "H21", `${billCount(m.logs)} billes`);
        }
        widths(ws, [8, 10, 10, 12, 12, 4, 4, 24, 12]);
      }
    }
    if (t.measurements.length === 0) {
      wb.addWorksheet("Étalage").addRow(["Aucun étalage saisi"]);
    }
    await send(reply, wb, `etalage-${t.registration.replace(/\s+/g, "-")}.xlsx`);
  });

  // ── Session de débitage : gabarit DEBITES (TABLEAU DE STOCK) ──────────
  app.get<{ Params: { id: string } }>("/production-runs/:id/export.xlsx", async (req, reply) => {
    const r = await prisma.productionRun.findUnique({
      where: { id: req.params.id },
      include: {
        contract: { select: { code: true } },
        lines: { orderBy: { position: "asc" } },
        trucks: {
          include: {
            truck: {
              select: {
                registration: true,
                deliveryNote: true,
                declaredFieldM3: true,
                measurements: {
                  select: { context: true, logs: { select: { volumeM3: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!r) return reply.code(404).send({ error: "Session introuvable" });

    const wb = new ExcelJS.Workbook();
    const date = frDate(r.producedAt);
    const ws = wb.addWorksheet(sheetName(wb, `DEBITE TECK DU ${date} A`));
    const trucks = r.trucks.map((x) => x.truck);
    put(ws, "A2", "TABLEAU DE STOCK", true);
    ws.mergeCells("A2:F2");
    put(
      ws,
      "A3",
      trucks.length ? `CAMION ${trucks.map((t) => t.registration).join(" / ")}` : "",
      true,
    );
    ws.mergeCells("A3:F4");

    const { total } = writeSawnTable(ws, r.lines, { firstCol: 1, headerRow: 5 });

    const brousse = trucks.reduce((s, t) => s + fieldM3(t), 0);
    const parc = trucks.reduce((s, t) => s + yardM3(t), 0);
    const bl = trucks
      .map((t) => t.deliveryNote)
      .filter(Boolean)
      .join(" / ");
    if (bl) put(ws, "K6", bl);
    put(ws, "I7", "CUBAGE BROUSSE");
    put(ws, "K7", brousse ? n3(brousse) : "");
    put(ws, "I8", "CUBAGE PARC");
    put(ws, "K8", parc ? n3(parc) : "");
    put(ws, "I9", "DEBITE", true);
    put(ws, "K9", n3(total), true);
    put(ws, "I10", "REND PARC");
    put(ws, "K10", parc > 0 ? Math.round((total / parc) * 1000) / 1000 : "");
    put(ws, "I12", r.contract?.code ?? "");
    if (r.note) put(ws, "I13", r.note);
    writeCuttingResume(ws, r.lines, "I", 15);
    widths(ws, [6, 16, 15, 17, 13, 13, 7, 4, 18, 4, 12]);
    await send(reply, wb, `debite-${r.producedAt.toISOString().slice(0, 10)}.xlsx`);
  });

  // ── Conteneur : gabarit EMPOTAGES (tableau en B, PRODUITS, marge en K) ──
  app.get<{ Params: { id: string } }>("/containers/:id/export.xlsx", async (req, reply) => {
    const c = await prisma.container.findUnique({
      where: { id: req.params.id },
      include: {
        contract: { select: { code: true } },
        items: { orderBy: { position: "asc" } },
        trucks: { include: { truck: { select: { registration: true, trailer: true } } } },
      },
    });
    if (!c) return reply.code(404).send({ error: "Conteneur introuvable" });

    const wb = new ExcelJS.Workbook();
    const date = frDate(c.loadedAt ?? c.createdAt);
    const ws = wb.addWorksheet(sheetName(wb, `${c.containerNo.replace("/", "-")} DU ${date}`));
    put(ws, "B2", "EMPOTAGE TECK", true);
    ws.mergeCells("B2:H2");
    put(ws, "B3", `${c.containerNo}${c.grade ? ` (${c.grade})` : ""}`, true);
    ws.mergeCells("B3:H4");

    const { total, pieces } = writeSawnTable(ws, c.items, {
      firstCol: 2,
      headerRow: 5,
      product: c.grade ?? "",
    });

    put(ws, "K7", `N°PLOMB = ${c.sealNo ?? ""}`);
    put(ws, "K9", "DEBITE", true);
    put(ws, "M9", n3(total), true);
    put(ws, "K11", "Nbre elm");
    put(ws, "M11", pieces);
    put(ws, "K13", c.contract?.code ?? "");
    put(ws, "K15", "POIDS");
    put(ws, "M15", n3(total * 0.65));
    if (c.trucks.length) {
      const regs = c.trucks.map((x) => x.truck.registration).join(" / ");
      const trailers = c.trucks
        .map((x) => x.truck.trailer)
        .filter(Boolean)
        .join(" / ");
      put(ws, "K19", `N° CAM ${regs}${trailers ? `  REMORQUE ${trailers}` : ""}`);
      ws.mergeCells("K19:N19");
    }
    if (c.destination) put(ws, "K21", c.destination);
    widths(ws, [3, 6, 16, 16, 15, 17, 13, 13, 7, 4, 18, 4, 12, 12]);
    await send(reply, wb, `empotage-${c.containerNo.replace(/[\s/]+/g, "-")}.xlsx`);
  });

  // ── Dashboard contrat ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/contracts/:id/export.xlsx", async (req, reply) => {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });
    const contractId = contract.id;

    const [trucks, runs, sawnLines, saleLines, entries] = await Promise.all([
      prisma.truck.findMany({
        where: { contractId },
        orderBy: { arrivedAt: "asc" },
        include: { measurements: { include: { logs: true } }, _count: { select: { productionRuns: true } } },
      }),
      prisma.productionRun.findMany({
        where: { contractId },
        include: {
          lines: { select: { volumeM3: true } },
          trucks: true,
          logs: { select: { logId: true } },
        },
      }),
      prisma.sawnLine.findMany({
        where: { run: { contractId } },
        select: { sizeCode: true, sizeGroup: true, volumeM3: true, count: true },
      }),
      prisma.saleLine.findMany({
        where: { sale: { contractId } },
        select: { sizeCode: true, volumeM3: true, amountCfa: true },
      }),
      prisma.accountEntry.findMany({
        where: { contractId },
        include: { party: { select: { name: true } } },
        orderBy: { entryDate: "asc" },
      }),
    ]);

    const wb = new ExcelJS.Workbook();

    // Feuille Résumé
    const rs = wb.addWorksheet("Résumé");
    boldRow(rs.addRow([`CONTRAT ${contract.code}`, contract.year ?? ""]));
    rs.addRow([]);
    const girth = trucks.reduce(
      (s, t) =>
        s +
        t.measurements
          .filter((m) => m.context === "YARD_GIRTH")
          .reduce((x, m) => x + m.logs.reduce((y, l) => y + Number(l.volumeM3), 0), 0),
      0
    );
    const debited = sawnLines.reduce((s, l) => s + Number(l.volumeM3), 0);
    // Rendement (F6) sur les billons passés à la scie : ceux qui attendent au
    // parc ne le font pas baisser (même règle que la fiche contrat).
    const runLinks = runs.map((r) => ({
      truckIds: r.trucks.map((x) => x.truckId),
      logIds: r.logs.map((x) => x.logId),
    }));
    const sawnGirth = trucks.reduce(
      (s, t) => s + truckSawnProgress(t, runLinks).sawnGirthM3,
      0
    );
    const sold = saleLines.reduce((s, l) => s + Number(l.volumeM3), 0);
    const revenue = saleLines.reduce((s, l) => s + Number(l.amountCfa), 0);
    let due = 0;
    let paid = 0;
    for (const e of entries) {
      if (e.kind === "DUE") due += Number(e.amount);
      else paid += Number(e.amount);
    }
    const sawnSet = new Set(runs.filter((r) => r.trucks.length > 0).flatMap((r) => r.trucks.map((x) => x.truckId)));
    const rows: [string, number | string][] = [
      ["Quota m³", Number(contract.quotaM3)],
      ["Camions prévus", contract.trucksPlanned],
      ["Camions entrés", trucks.length],
      ["Camions sciés", [...sawnSet].length],
      ["Sur parc non sciés", trucks.length - [...sawnSet].length],
      ["Cubage girth m³", girth],
      ["Billons sciés m³", sawnGirth],
      ["Débité m³", debited],
      ["Rendement %", sawnGirth > 0 ? (debited / sawnGirth) * 100 : 0],
      ["Vendu m³", sold],
      ["CA ventes FCFA", revenue],
      ["Full cost (Σ dûs) FCFA", due],
      ["Payé FCFA", paid],
      ["Solde FCFA", due - paid],
      ["Profit estimé FCFA", revenue - due],
    ];
    for (const r of rows) rs.addRow(r);
    rs.columns.forEach((c) => (c.width = 24));

    // Feuille Cutting
    const cs = wb.addWorksheet("Cutting");
    headerStyle(cs.addRow(["Taille", "Groupe", "m³", "Pièces"]));
    const bySize = new Map<string, { group: SizeGroup; m3: number; pieces: number }>();
    for (const l of sawnLines) {
      const acc = bySize.get(l.sizeCode) ?? { group: l.sizeGroup as SizeGroup, m3: 0, pieces: 0 };
      acc.m3 += Number(l.volumeM3);
      acc.pieces += l.count;
      bySize.set(l.sizeCode, acc);
    }
    [...bySize.entries()]
      .sort((a, b) => sizeSortIndex(a[0]) - sizeSortIndex(b[0]))
      .forEach(([code, a]) => cs.addRow([code, SIZE_GROUP_LABELS[a.group], a.m3, a.pieces]));
    boldRow(cs.addRow(["TOTAL", "", debited, sawnLines.reduce((s, l) => s + l.count, 0)]));
    cs.columns.forEach((c) => (c.width = 16));

    // Feuille Camions
    const ts = wb.addWorksheet("Camions");
    headerStyle(
      ts.addRow(["Camion", "B/L", "Arrivé", "Billes", "Billons", "Brousse m³", "Girth m³", "Dia m³", "Scié"])
    );
    for (const t of trucks) {
      let f = 0;
      let g = 0;
      let d = 0;
      let billons = 0; // lignes girth = billons issus du tronçonnage
      let billesDia = 0; // lignes diamètre = billes étalées
      let billesGirth = 0; // billes mères déduites des n° de billons
      for (const m of t.measurements) {
        const v = m.logs.reduce((x, l) => x + Number(l.volumeM3), 0);
        if (m.context === "FIELD") f += v;
        else if (m.context === "YARD_GIRTH") {
          g += v;
          billons += m.logs.length;
          billesGirth += billCount(m.logs);
        } else {
          d += v;
          billesDia += m.logs.length;
        }
      }
      if (f === 0 && t.declaredFieldM3) f = Number(t.declaredFieldM3);
      ts.addRow([
        t.registration,
        t.deliveryNote ?? "",
        t.arrivedAt.toISOString().slice(0, 10),
        billesDia || billesGirth || t.declaredLogCount || 0,
        billons,
        f,
        g,
        d,
        sawnSet.has(t.id) ? "OUI" : "NON",
      ]);
    }
    ts.columns.forEach((c) => (c.width = 14));

    // Feuille Comptes
    const as = wb.addWorksheet("Comptes");
    headerStyle(as.addRow(["Date", "Tiers", "Type", "Montant FCFA", "Description"]));
    for (const e of entries) {
      as.addRow([
        e.entryDate.toISOString().slice(0, 10),
        e.party.name,
        e.kind === "DUE" ? "Dû" : "Payé",
        Number(e.amount),
        e.description ?? "",
      ]);
    }
    boldRow(as.addRow(["", "TOTAL", "Dû", due, ""]));
    boldRow(as.addRow(["", "TOTAL", "Payé", paid, ""]));
    boldRow(as.addRow(["", "TOTAL", "Solde", due - paid, ""]));
    as.columns.forEach((c) => (c.width = 16));

    await send(reply, wb, `contrat-${contract.code}.xlsx`);
  });
}
