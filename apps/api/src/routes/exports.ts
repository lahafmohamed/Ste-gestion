import type { FastifyInstance, FastifyReply } from "fastify";
import ExcelJS from "exceljs";
import type { SizeGroup } from "@ste/shared";
import {
  GIRTH_SPLIT_CM,
  LONG_SPLIT_FT,
  MEASUREMENT_CONTEXT_LABELS,
  SIZE_GROUP_LABELS,
  billCount,
  sizeSortIndex,
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

export async function exportRoutes(app: FastifyInstance) {
  // ── Étalage camion (une feuille par cubage) ─────────────────────────
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
    for (const m of t.measurements) {
      const isDia = m.context === "YARD_DIAMETER";
      const ws = wb.addWorksheet(MEASUREMENT_CONTEXT_LABELS[m.context].slice(0, 31));

      ws.addRow([`CAMION ${t.registration}`, "", t.deliveryNote ? `B/L ${t.deliveryNote}` : "", t.origin ?? "", t.contract.code]);
      ws.addRow([t.parcel ? `PARCELLE ${t.parcel}` : "", "", "", "", ""]);
      ws.addRow([]);
      const head = isDia
        ? ["Log#", "N° bille", "Longueur (m)", "Ø (cm)", "Volume m³", "CFT"]
        : ["Log#", m.context === "YARD_GIRTH" ? "N° billon" : "N° bille", "Longueur (m)", "Circ (cm)", "Volume m³"];
      headerStyle(ws.addRow(head));

      let total = 0;
      const vols: number[] = [];
      for (const l of m.logs) {
        const v = Number(l.volumeM3);
        total += v;
        vols.push(v);
        ws.addRow(
          isDia
            ? [l.position, l.externalId ?? "", Number(l.lengthFt), Number(l.diameterIn), v, Number(l.cft)]
            : [l.position, l.externalId ?? "", Number(l.lengthM), Number(l.circumferenceCm), v]
        );
      }
      ws.addRow([]);
      // Girth = billons issus du tronçonnage → on rappelle le nb de billes mères.
      boldRow(
        ws.addRow([
          "Total",
          m.logs.length,
          m.context === "YARD_GIRTH" ? `${billCount(m.logs)} billes` : "",
          "",
          total,
        ])
      );
      if (vols.length > 0) {
        ws.addRow(["Moyenne", "", "", "", total / vols.length]);
        ws.addRow(["Max", "", "", "", Math.max(...vols)]);
        ws.addRow(["Min", "", "", "", Math.min(...vols)]);
      }
      if (m.context === "YARD_GIRTH") {
        let gte = 0;
        let lt = 0;
        for (const l of m.logs) {
          const v = Number(l.volumeM3);
          if (Number(l.circumferenceCm ?? 0) >= GIRTH_SPLIT_CM) gte += v;
          else lt += v;
        }
        ws.addRow([]);
        ws.addRow([`VOL G ≥${GIRTH_SPLIT_CM}`, "", "", "", gte]);
        ws.addRow([`VOL G <${GIRTH_SPLIT_CM}`, "", "", "", lt]);
      }
      ws.columns.forEach((c) => (c.width = 14));
    }
    if (t.measurements.length === 0) {
      wb.addWorksheet("Étalage").addRow(["Aucun étalage saisi"]);
    }
    await send(reply, wb, `etalage-${t.registration.replace(/\s+/g, "-")}.xlsx`);
  });

  // ── Session de débitage ─────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/production-runs/:id/export.xlsx",
    async (req, reply) => {
      const r = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        include: {
          contract: { select: { code: true } },
          lines: { orderBy: { position: "asc" } },
          trucks: { include: { truck: { select: { registration: true } } } },
        },
      });
      if (!r) return reply.code(404).send({ error: "Session introuvable" });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Débité");
      const date = r.producedAt.toISOString().slice(0, 10);
      ws.addRow([`DÉBITÉ TECK DU ${date}`, "", r.contract.code, r.note ?? ""]);
      if (r.trucks.length > 0) {
        ws.addRow([`CAMIONS : ${r.trucks.map((x) => x.truck.registration).join(", ")}`]);
      }
      ws.addRow([]);
      headerStyle(
        ws.addRow(["#", "Longueur (ft)", "Largeur (in)", "Épaisseur (in)", "Nbr", "Taille", "Groupe", "Volume m³"])
      );

      let total = 0;
      let pieces = 0;
      let longM3 = 0;
      const groups: Record<SizeGroup, number> = { MAIN: 0, SIDE: 0, ONE_INCH: 0, OTHER: 0 };
      for (const l of r.lines) {
        const v = Number(l.volumeM3);
        total += v;
        pieces += l.count;
        if (Number(l.lengthFt) >= LONG_SPLIT_FT) longM3 += v;
        groups[l.sizeGroup as SizeGroup] += v;
        ws.addRow([
          l.position,
          Number(l.lengthFt),
          Number(l.widthIn),
          Number(l.thicknessIn),
          l.count,
          l.sizeCode,
          SIZE_GROUP_LABELS[l.sizeGroup as SizeGroup],
          v,
        ]);
      }
      ws.addRow([]);
      boldRow(ws.addRow(["TOTAL", "", "", "", pieces, "", "", total]));
      ws.addRow([]);
      for (const g of ["MAIN", "SIDE", "ONE_INCH", "OTHER"] as SizeGroup[]) {
        if (groups[g] > 0) ws.addRow([SIZE_GROUP_LABELS[g], "", "", "", "", "", "", groups[g]]);
      }
      ws.addRow([`Long ${LONG_SPLIT_FT} ft+`, "", "", "", "", "", "", longM3]);
      ws.addRow(["Court", "", "", "", "", "", "", total - longM3]);
      ws.columns.forEach((c) => (c.width = 14));
      await send(reply, wb, `debite-${date}.xlsx`);
    }
  );

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
        include: { lines: { select: { volumeM3: true } }, trucks: true },
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
      ["Débité m³", debited],
      ["Rendement %", girth > 0 ? (debited / girth) * 100 : 0],
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
