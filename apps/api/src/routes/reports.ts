import type { FastifyInstance } from "fastify";
import {
  GIRTH_SPLIT_CM,
  LONG_SPLIT_FT,
  THICKNESS_BANDS,
  billCount,
  runSawnGirthM3,
  truckCostCfa,
  truckSawnProgress,
} from "@ste/shared";
import { prisma } from "../prisma.js";

const pct = (part: number, total: number) =>
  (total > 0 ? (part / total) * 100 : 0).toFixed(2);

export async function reportRoutes(app: FastifyInstance) {
  // ── Analyse par camion (miroir du Daily Truck Log Excel) ────────────
  app.get<{ Params: { id: string } }>("/contracts/:id/truck-stats", async (req, reply) => {
    const contractId = req.params.id;
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

    const [trucks, runs] = await Promise.all([
      prisma.truck.findMany({
        where: { contractId },
        orderBy: { arrivedAt: "asc" },
        include: {
          measurements: { include: { logs: true }, orderBy: { measuredAt: "asc" } },
        },
      }),
      // Sessions qui ont scié un camion du contrat — y compris celles qui
      // mélangent deux contrats (contractId null) : leur quote-part revient à
      // chacun de leurs camions, sinon le camion paraît « pas encore scié ».
      prisma.productionRun.findMany({
        where: { trucks: { some: { truck: { contractId } } } },
        include: {
          lines: { select: { volumeM3: true, thicknessIn: true, lengthFt: true } },
          trucks: true,
          logs: { select: { logId: true } },
        },
      }),
    ]);

    // Billons cochés par session : dénominateur du rendement d'un camion entamé.
    const runLinks = runs.map((r) => ({
      truckIds: r.trucks.map((x) => x.truckId),
      logIds: r.logs.map((x) => x.logId),
    }));

    // Débité attribué : volumes de la session ÷ nb de camions liés — total et
    // splits Daily Truck Log (bandes d'épaisseur + LONG/SHORT).
    type SawnSplit = {
      total: number;
      gte3: number; // MAIN SIZE (ép ≥ 3")
      b15to3: number; // colonne 1.5" (ép 1,5 – 3")
      lt15: number; // colonne 1" (ép < 1,5")
      long: number;
      short: number;
    };
    const debitedByTruck = new Map<string, SawnSplit>();
    for (const r of runs) {
      if (r.trucks.length === 0) continue;
      const s: SawnSplit = { total: 0, gte3: 0, b15to3: 0, lt15: 0, long: 0, short: 0 };
      for (const l of r.lines) {
        const v = Number(l.volumeM3);
        s.total += v;
        const bi = THICKNESS_BANDS.findIndex((b) => b.test(Number(l.thicknessIn)));
        if (bi === 0) s.gte3 += v;
        else if (bi === 1) s.b15to3 += v;
        else s.lt15 += v;
        if (Number(l.lengthFt) >= LONG_SPLIT_FT) s.long += v;
        else s.short += v;
      }
      const n = r.trucks.length;
      for (const t of r.trucks) {
        let acc = debitedByTruck.get(t.truckId);
        if (!acc) {
          acc = { total: 0, gte3: 0, b15to3: 0, lt15: 0, long: 0, short: 0 };
          debitedByTruck.set(t.truckId, acc);
        }
        acc.total += s.total / n;
        acc.gte3 += s.gte3 / n;
        acc.b15to3 += s.b15to3 / n;
        acc.lt15 += s.lt15 / n;
        acc.long += s.long / n;
        acc.short += s.short / n;
      }
    }

    return trucks.map((t) => {
      let fieldM3 = 0;
      let girthM3 = 0;
      let diaM3 = 0;
      let diaCount = 0; // lignes diamètre = billes étalées
      let billonCount = 0; // lignes girth = billons issus du tronçonnage
      let gte85 = 0;
      let lt85 = 0;
      const girthLogs: { externalId: string | null }[] = [];
      // Sessions d'étalage (feuilles A/B/C de l'Excel) : billes par relevé.
      const diaSessions: number[] = [];
      const girthSessions: { externalId: string | null }[][] = [];
      for (const m of t.measurements) {
        if (m.context === "YARD_DIAMETER" && m.logs.length > 0) {
          diaSessions.push(m.logs.length);
        } else if (m.context === "YARD_GIRTH" && m.logs.length > 0) {
          girthSessions.push(m.logs);
        }
        for (const l of m.logs) {
          const v = Number(l.volumeM3);
          if (m.context === "FIELD") fieldM3 += v;
          else if (m.context === "YARD_DIAMETER") {
            diaM3 += v;
            diaCount += 1;
          } else {
            girthM3 += v;
            billonCount += 1;
            girthLogs.push(l);
            if (Number(l.circumferenceCm ?? 0) >= GIRTH_SPLIT_CM) gte85 += v;
            else lt85 += v;
          }
        }
      }
      const split = debitedByTruck.get(t.id);
      const debited = split?.total ?? 0;
      // F6 sur les seuls billons passés à la scie : un camion à moitié scié
      // n'affiche plus un rendement divisé par deux.
      const sawnGirth = truckSawnProgress(t, runLinks).sawnGirthM3;
      // Fallback sur le déclaré (B/L) si pas d'étalage brousse saisi.
      if (fieldM3 === 0 && t.declaredFieldM3) fieldM3 = Number(t.declaredFieldM3);
      // Billes : étalage Ø > billes mères déduites des n° de billons > bordereau.
      const billeCount = diaCount || billCount(girthLogs) || t.declaredLogCount || 0;
      // Billes par relevé (colonnes A/B/C du Daily Truck Log) — même priorité de source.
      const billeCounts =
        diaSessions.length > 0
          ? diaSessions
          : girthSessions.length > 0
            ? girthSessions.map((logs) => billCount(logs))
            : t.declaredLogCount
              ? [t.declaredLogCount]
              : [];

      const msM3 = (split?.gte3 ?? 0) + (split?.b15to3 ?? 0);
      // Cost Daily Truck Log : (BDR×SODEFOR + DIA×Ibrahim + transport + cubage) ÷ débité (ou ÷ MS).
      const costTotal = truckCostCfa({
        bdrM3: fieldM3,
        diaM3,
        sodeforPrice: Number(contract.sodeforPrice),
        ibrahimPrice: Number(contract.ibrahimPrice),
        transportPrice: Number(contract.transportPrice),
        cubagePrice: Number(contract.cubagePrice),
      });

      return {
        truckId: t.id,
        registration: t.registration,
        deliveryNote: t.deliveryNote,
        arrivedAt: t.arrivedAt,
        sawn: debitedByTruck.has(t.id),
        billeCount,
        billeCounts,
        billonCount,
        fieldM3: fieldM3.toFixed(6),
        girthM3: girthM3.toFixed(6),
        girthGte85M3: gte85.toFixed(6),
        girthLt85M3: lt85.toFixed(6),
        diaM3: diaM3.toFixed(6),
        debitedM3: debited.toFixed(6),
        sawnGirthM3: sawnGirth.toFixed(6),
        outputPct: pct(debited, sawnGirth),
        mainM3: (split?.gte3 ?? 0).toFixed(6),
        band15M3: (split?.b15to3 ?? 0).toFixed(6),
        msM3: msM3.toFixed(6),
        oneInchM3: (split?.lt15 ?? 0).toFixed(6),
        oneInchPct: pct(split?.lt15 ?? 0, debited),
        longM3: (split?.long ?? 0).toFixed(6),
        shortM3: (split?.short ?? 0).toFixed(6),
        costPerM3: debited > 0 ? (costTotal / debited).toFixed(0) : null,
        costMsPerM3: msM3 > 0 ? (costTotal / msM3).toFixed(0) : null,
      };
    });
  });

  // ── Rapport d'activité du jour ──────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    "/contracts/:id/daily-report",
    async (req, reply) => {
      const contractId = req.params.id;
      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

      const dateStr = req.query.date;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return reply.code(400).send({ error: "Paramètre date requis (YYYY-MM-DD)" });
      }
      const from = new Date(`${dateStr}T00:00:00.000Z`);
      const to = new Date(`${dateStr}T23:59:59.999Z`);
      const range = { gte: from, lte: to };

      const [arrivedTrucks, measurements, runs, containers] = await Promise.all([
        prisma.truck.findMany({
          where: { contractId, arrivedAt: range },
          include: { measurements: { include: { logs: true } } },
          orderBy: { arrivedAt: "asc" },
        }),
        prisma.logMeasurement.findMany({
          where: { truck: { contractId }, measuredAt: range },
          include: { logs: true, truck: { select: { registration: true } } },
          orderBy: { measuredAt: "asc" },
        }),
        prisma.productionRun.findMany({
          where: { contractId, producedAt: range },
          include: {
            lines: true,
            logs: { select: { logId: true } },
            trucks: {
              include: {
                truck: {
                  select: {
                    id: true,
                    registration: true,
                    measurements: {
                      where: { context: "YARD_GIRTH" },
                      include: { logs: { select: { id: true, volumeM3: true } } },
                    },
                  },
                },
              },
            },
          },
          orderBy: { producedAt: "asc" },
        }),
        prisma.container.findMany({
          where: { contractId, loadedAt: range },
          include: { items: true },
          orderBy: { loadedAt: "asc" },
        }),
      ]);

      const arrivals = arrivedTrucks.map((t) => {
        const field = t.measurements.filter((m) => m.context === "FIELD");
        const fieldM3 = field.reduce(
          (s, m) => s + m.logs.reduce((x, l) => x + Number(l.volumeM3), 0),
          0
        );
        // Nombre de BILLES : brousse et diamètre = 1 ligne par bille ; le girth
        // compte des billons (266A, 266B… d'une même bille) → regroupés.
        const dia = t.measurements.filter((m) => m.context === "YARD_DIAMETER");
        const girth = t.measurements.filter((m) => m.context === "YARD_GIRTH");
        const logCount =
          field.reduce((s, m) => s + m.logs.length, 0) ||
          dia.reduce((s, m) => s + m.logs.length, 0) ||
          girth.reduce((s, m) => s + billCount(m.logs), 0) ||
          t.declaredLogCount ||
          null;
        const declared = t.declaredFieldM3 ? Number(t.declaredFieldM3) : null;
        return {
          registration: t.registration,
          deliveryNote: t.deliveryNote,
          parcel: t.parcel,
          origin: t.origin,
          fieldM3:
            field.length > 0
              ? fieldM3.toFixed(6)
              : declared !== null
                ? declared.toFixed(6)
                : null,
          logCount,
        };
      });

      const tallies = measurements.map((m) => {
        const total = m.logs.reduce((s, l) => s + Number(l.volumeM3), 0);
        let gte85: number | null = null;
        let lt85: number | null = null;
        if (m.context === "YARD_GIRTH") {
          gte85 = 0;
          lt85 = 0;
          for (const l of m.logs) {
            const v = Number(l.volumeM3);
            if (Number(l.circumferenceCm ?? 0) >= GIRTH_SPLIT_CM) gte85 += v;
            else lt85 += v;
          }
        }
        return {
          registration: m.truck.registration,
          context: m.context,
          totalM3: total.toFixed(6),
          logCount: m.logs.length,
          billCount: m.context === "YARD_GIRTH" ? billCount(m.logs) : null,
          girthGte85M3: gte85 === null ? null : gte85.toFixed(6),
          girthLt85M3: lt85 === null ? null : lt85.toFixed(6),
        };
      });

      const production = runs.map((r) => {
        const total = r.lines.reduce((s, l) => s + Number(l.volumeM3), 0);
        const pieces = r.lines.reduce((s, l) => s + l.count, 0);
        let longM3 = 0;
        let shortM3 = 0;
        const bandTotals = THICKNESS_BANDS.map(() => 0);
        for (const l of r.lines) {
          const v = Number(l.volumeM3);
          if (Number(l.lengthFt) >= LONG_SPLIT_FT) longM3 += v;
          else shortM3 += v;
          const t = Number(l.thicknessIn);
          const bi = THICKNESS_BANDS.findIndex((b) => b.test(t));
          if (bi >= 0) bandTotals[bi] += v;
        }
        // Billons cochés de chaque camion, ou le camion entier s'il n'en a aucun.
        const girthLinked = runSawnGirthM3(
          r.trucks.map((rt) => rt.truck),
          r.logs.map((l) => l.logId)
        );
        return {
          note: r.note,
          trucks: r.trucks.map((rt) => rt.truck.registration),
          totalM3: total.toFixed(6),
          pieces,
          girthLinkedM3: r.trucks.length > 0 ? girthLinked.toFixed(6) : null,
          outputPct: r.trucks.length > 0 && girthLinked > 0 ? pct(total, girthLinked) : null,
          longM3: longM3.toFixed(6),
          shortM3: shortM3.toFixed(6),
          longPct: pct(longM3, total),
          bands: THICKNESS_BANDS.map((b, i) => ({
            label: b.label,
            m3: bandTotals[i].toFixed(6),
            pct: pct(bandTotals[i], total),
          })),
        };
      });

      const loadings = containers.map((c) => ({
        containerNo: c.containerNo,
        sealNo: c.sealNo,
        fauxSealNo: c.fauxSealNo,
        bookingNo: c.bookingNo,
        destination: c.destination,
        grade: c.grade,
        totalM3: c.items.reduce((s, i) => s + Number(i.volumeM3), 0).toFixed(6),
        pieces: c.items.reduce((s, i) => s + i.count, 0),
      }));

      return {
        date: dateStr,
        contractCode: contract.code,
        arrivals,
        tallies,
        production,
        loadings,
      };
    }
  );
}
