import type { FastifyInstance } from "fastify";
import type { SizeGroup } from "@ste/shared";
import {
  GIRTH_SPLIT_CM,
  LONG_SPLIT_FT,
  billCount,
  sawnGirthByTruck as sawnGirthOfTrucks,
  sizeSortIndex,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { canSeeFinance, redactSummary } from "../finance.js";

export async function summaryRoutes(app: FastifyInstance) {
  // Vue liste — ce dont les cartes des pages Contrats et Tableau de bord ont
  // besoin, pour tous les contrats d'un coup : 7 requêtes au total, au lieu du
  // résumé complet (7 requêtes) répété une fois par contrat.
  // Route statique : elle passe avant `/contracts/:id` côté routeur Fastify.
  app.get("/contracts/overview", async (req) => {
    const showMoney = await canSeeFinance(req);
    const [contracts, trucks, logs, sawnLines, saleLines, resawLines, entries, runTrucks, runLogs] =
      await Promise.all([
        prisma.contract.findMany({ select: { id: true, quotaM3: true } }),
        prisma.truck.findMany({
          select: {
            id: true,
            contractId: true,
            declaredFieldM3: true,
            packingLogs: { select: { volumeM3: true } },
            _count: { select: { productionRuns: true } },
          },
        }),
        // FIELD (brousse) et YARD_GIRTH (dénominateur du rendement) en une passe.
        prisma.log.findMany({
          where: { measurement: { context: { in: ["FIELD", "YARD_GIRTH"] } } },
          select: {
            id: true,
            volumeM3: true,
            measurement: { select: { context: true, truckId: true } },
          },
        }),
        prisma.sawnLine.findMany({
          select: { volumeM3: true, run: { select: { contractId: true } } },
        }),
        prisma.saleLine.findMany({
          select: {
            volumeM3: true,
            amountCfa: true,
            sale: { select: { contractId: true } },
          },
        }),
        prisma.resawLine.findMany({
          select: { kind: true, volumeM3: true, op: { select: { contractId: true } } },
        }),
        prisma.accountEntry.groupBy({
          by: ["contractId", "kind"],
          _sum: { amount: true },
        }),
        // Sessions rattachées à un contrat — les mêmes qui comptent dans le
        // débité : leurs billons sciés forment le dénominateur du rendement.
        prisma.productionRunTruck.findMany({
          where: { run: { contractId: { not: null } } },
          select: { runId: true, truckId: true },
        }),
        prisma.productionRunLog.findMany({
          where: { run: { contractId: { not: null } } },
          select: { runId: true, logId: true },
        }),
      ]);

    // Camion → contrat : les lignes de relevé ne portent que le camion.
    const contractByTruck = new Map(trucks.map((t) => [t.id, t.contractId]));

    const fieldByTruck = new Map<string, number>();
    const girthLogs: { id: string; truckId: string; volumeM3: unknown }[] = [];
    for (const l of logs) {
      const tid = l.measurement.truckId;
      if (l.measurement.context === "FIELD") {
        fieldByTruck.set(tid, (fieldByTruck.get(tid) ?? 0) + Number(l.volumeM3));
      } else {
        girthLogs.push({ id: l.id, truckId: tid, volumeM3: l.volumeM3 });
      }
    }
    // Rendement F6 sur les billons passés à la scie, pas sur tout le parc.
    const sawnGirthByContract = new Map<string, number>();
    for (const [tid, v] of sawnGirthOfTrucks(girthLogs, runTrucks, runLogs)) {
      const cid = contractByTruck.get(tid);
      if (cid) sawnGirthByContract.set(cid, (sawnGirthByContract.get(cid) ?? 0) + v);
    }

    // ── Agrégats production / ventes / resciage / compta, par contrat ──
    const money = new Map<
      string,
      { debited: number; sold: number; revenue: number; resawIn: number; resawOut: number; due: number; paid: number }
    >();
    const bucket = (cid: string) => {
      let b = money.get(cid);
      if (!b) {
        b = { debited: 0, sold: 0, revenue: 0, resawIn: 0, resawOut: 0, due: 0, paid: 0 };
        money.set(cid, b);
      }
      return b;
    };
    // Débitage et resciage alimentent le stock général : ce qui n'est rattaché
    // à aucun contrat (session multi-contrats, resciage) ne compte pour aucun.
    for (const l of sawnLines) {
      if (l.run.contractId) bucket(l.run.contractId).debited += Number(l.volumeM3);
    }
    for (const l of saleLines) {
      const b = bucket(l.sale.contractId);
      b.sold += Number(l.volumeM3);
      b.revenue += Number(l.amountCfa);
    }
    for (const l of resawLines) {
      if (!l.op.contractId) continue;
      const b = bucket(l.op.contractId);
      if (l.kind === "PRODUCED") b.resawIn += Number(l.volumeM3);
      else b.resawOut += Number(l.volumeM3);
    }
    for (const e of entries) {
      const b = bucket(e.contractId);
      const amount = Number(e._sum.amount ?? 0);
      if (e.kind === "DUE") b.due += amount;
      else b.paid += amount;
    }

    // Brousse par camion : même ordre de préférence que le résumé complet
    // (étalage brousse 1-par-1 → packing list → total déclaré au bordereau).
    const acc = new Map<
      string,
      { trucks: number; sawn: number; brousse: number; measured: number }
    >();
    for (const c of contracts) acc.set(c.id, { trucks: 0, sawn: 0, brousse: 0, measured: 0 });
    for (const t of trucks) {
      const a = acc.get(t.contractId);
      if (!a) continue;
      const field = fieldByTruck.get(t.id) ?? 0;
      const packing = t.packingLogs.reduce((s, p) => s + Number(p.volumeM3), 0);
      const v = field > 0 ? field : packing > 0 ? packing : Number(t.declaredFieldM3 ?? 0);
      a.trucks += 1;
      if (t._count.productionRuns > 0) a.sawn += 1;
      a.brousse += v;
      if (v > 0) a.measured += 1;
    }

    const overview = contracts.map((c) => {
      const a = acc.get(c.id)!;
      const avg = a.measured > 0 ? a.brousse / a.measured : 0;
      const remainingQuota = Math.max(Number(c.quotaM3) - a.brousse, 0);
      const estTrucksRemaining = avg > 0 ? Math.ceil(remainingQuota / avg) : null;
      const b = money.get(c.id);
      const debited = b?.debited ?? 0;
      const sawnGirth = sawnGirthByContract.get(c.id) ?? 0;
      const stockProducts = debited + (b?.resawIn ?? 0) - (b?.sold ?? 0) - (b?.resawOut ?? 0);
      return {
        contractId: c.id,
        trucksEntered: a.trucks,
        trucksSawn: a.sawn,
        brousseM3: a.brousse.toFixed(6),
        estTrucksTotal: estTrucksRemaining !== null ? a.trucks + estTrucksRemaining : null,
        debitedM3: debited.toFixed(6),
        outputPct: (sawnGirth > 0 ? (debited / sawnGirth) * 100 : 0).toFixed(4),
        stockProductsM3: stockProducts.toFixed(6),
        salesRevenueCfa: (b?.revenue ?? 0).toFixed(2),
        balance: ((b?.due ?? 0) - (b?.paid ?? 0)).toFixed(2),
      };
    });
    return showMoney ? overview : overview.map(redactSummary);
  });

  // Résumé dérivé complet du contrat
  app.get<{ Params: { id: string } }>("/contracts/:id/summary", async (req, reply) => {
    const contractId = req.params.id;
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

    const [
      trucks,
      logs,
      sawnLines,
      saleLines,
      entries,
      runTruckLinks,
      runLogLinks,
      resawLines,
    ] = await Promise.all([
      prisma.truck.findMany({
        where: { contractId },
        select: {
          id: true,
          declaredFieldM3: true,
          declaredLogCount: true,
          packingLogs: { select: { volumeM3: true } },
          _count: { select: { productionRuns: true } },
        },
      }),
      prisma.log.findMany({
        where: { measurement: { truck: { contractId } } },
        select: {
          id: true,
          externalId: true,
          volumeM3: true,
          circumferenceCm: true,
          measurement: { select: { context: true, truckId: true } },
        },
      }),
      prisma.sawnLine.findMany({
        where: { run: { contractId } },
        select: { sizeCode: true, sizeGroup: true, volumeM3: true, lengthFt: true },
      }),
      prisma.saleLine.findMany({
        where: { sale: { contractId } },
        select: { sizeCode: true, volumeM3: true, amountCfa: true },
      }),
      prisma.accountEntry.findMany({
        where: { contractId },
        select: { kind: true, amount: true },
      }),
      prisma.productionRunTruck.findMany({
        where: { run: { contractId } },
        select: { runId: true, truckId: true },
      }),
      prisma.productionRunLog.findMany({
        where: { run: { contractId } },
        select: {
          runId: true,
          logId: true,
          log: { select: { measurement: { select: { truckId: true } } } },
        },
      }),
      prisma.resawLine.findMany({
        where: { op: { contractId } },
        select: { kind: true, sizeCode: true, sizeGroup: true, volumeM3: true },
      }),
    ]);

    // ── Camions ──
    const sawnTruckSet = new Set(
      trucks.filter((t) => t._count.productionRuns > 0).map((t) => t.id)
    );
    const trucksEntered = trucks.length;
    const trucksSawn = sawnTruckSet.size;
    const declaredFieldM3 = trucks.reduce(
      (s, t) => s + Number(t.declaredFieldM3 ?? 0),
      0
    );
    const trucksOnParcUncut = trucksEntered - trucksSawn;
    const trucksRemaining = Math.max(contract.trucksPlanned - trucksEntered, 0);
    const totalUncut = trucksRemaining + trucksOnParcUncut;

    // ── Cubages par contexte + girth/brousse par camion ──
    let fieldM3 = 0;
    let girthM3 = 0;
    let diaM3 = 0;
    let billonCount = 0; // lignes girth = billons (une bille en donne plusieurs)
    let girthGte85 = 0;
    let girthLt85 = 0;
    const girthByTruck = new Map<string, number>();
    const fieldByTruck = new Map<string, number>(); // étalage brousse saisi (1 par 1)
    const diaCountByTruck = new Map<string, number>(); // billes étalées au Ø
    const girthLogsByTruck = new Map<string, { externalId: string | null }[]>();
    for (const l of logs) {
      const v = Number(l.volumeM3);
      const ctx = l.measurement.context;
      const tid = l.measurement.truckId;
      if (ctx === "FIELD") {
        fieldM3 += v;
        fieldByTruck.set(tid, (fieldByTruck.get(tid) ?? 0) + v);
      } else if (ctx === "YARD_DIAMETER") {
        diaM3 += v;
        diaCountByTruck.set(tid, (diaCountByTruck.get(tid) ?? 0) + 1);
      } else {
        girthM3 += v;
        billonCount += 1;
        if (Number(l.circumferenceCm ?? 0) >= GIRTH_SPLIT_CM) girthGte85 += v;
        else girthLt85 += v;
        girthByTruck.set(tid, (girthByTruck.get(tid) ?? 0) + v);
        const arr = girthLogsByTruck.get(tid);
        if (arr) arr.push(l);
        else girthLogsByTruck.set(tid, [l]);
      }
    }
    // Billes du contrat, camion par camion : étalage Ø > billes mères des
    // billons > comptage du bordereau. (Jamais la somme des lignes girth.)
    const billeCount = trucks.reduce(
      (s, t) =>
        s +
        ((diaCountByTruck.get(t.id) ?? 0) ||
          billCount(girthLogsByTruck.get(t.id) ?? []) ||
          t.declaredLogCount ||
          0),
      0
    );
    // ── Stock parc — granularité bille ──────────────────────────────────
    // Un camion lié à une session SANS billes précisées = camion entier scié
    // (historique). Sinon : reste = girth − billes sciées.
    const sawnLogIds = new Set(runLogLinks.map((l) => l.logId));
    // Runs ayant précisé ≥1 bille d'un camion donné.
    const runsWithBillesByTruck = new Map<string, Set<string>>();
    for (const l of runLogLinks) {
      const tid = l.log.measurement.truckId;
      if (!runsWithBillesByTruck.has(tid)) runsWithBillesByTruck.set(tid, new Set());
      runsWithBillesByTruck.get(tid)!.add(l.runId);
    }
    // Camion "entier scié" = au moins un lien run↔camion sans billes pour ce camion.
    const wholeTruckSawn = new Set<string>();
    for (const rt of runTruckLinks) {
      if (!runsWithBillesByTruck.get(rt.truckId)?.has(rt.runId)) {
        wholeTruckSawn.add(rt.truckId);
      }
    }
    // Girth scié par camion (billes précisées).
    const sawnGirthByTruck = new Map<string, number>();
    for (const l of logs) {
      if (l.measurement.context === "YARD_GIRTH" && sawnLogIds.has(l.id)) {
        const tid = l.measurement.truckId;
        sawnGirthByTruck.set(tid, (sawnGirthByTruck.get(tid) ?? 0) + Number(l.volumeM3));
      }
    }
    let stockParcM3 = 0;
    // Billons passés à la scie (camion entier ou billons cochés) : dénominateur
    // du rendement — ceux qui attendent au parc ne le font plus baisser.
    let sawnGirthM3 = 0;
    for (const [tid, v] of girthByTruck) {
      if (wholeTruckSawn.has(tid)) {
        sawnGirthM3 += v;
        continue; // tout parti au sciage
      }
      const sawn = Math.min(sawnGirthByTruck.get(tid) ?? 0, v);
      sawnGirthM3 += sawn;
      stockParcM3 += v - sawn;
    }

    // ── Brousse par camion (consommation du quota SODEFOR) ──
    // Ordre de préférence : étalage brousse 1-par-1 → packing list → total déclaré.
    let brousseM3 = 0;
    let trucksWithBrousse = 0; // camions avec un cubage brousse connu → base de la moyenne
    for (const t of trucks) {
      const field = fieldByTruck.get(t.id) ?? 0;
      const packing = t.packingLogs.reduce((s, p) => s + Number(p.volumeM3), 0);
      const declared = Number(t.declaredFieldM3 ?? 0);
      const v = field > 0 ? field : packing > 0 ? packing : declared;
      brousseM3 += v;
      if (v > 0) trucksWithBrousse += 1;
    }

    // ── Production / cutting par taille ──
    const producedBySize = new Map<string, { group: SizeGroup; m3: number }>();
    let debitedM3 = 0;
    let longM3 = 0;
    let shortM3 = 0;
    let oneInchM3 = 0;
    for (const l of sawnLines) {
      const v = Number(l.volumeM3);
      debitedM3 += v;
      if (Number(l.lengthFt) >= LONG_SPLIT_FT) longM3 += v;
      else shortM3 += v;
      if ((l.sizeGroup as SizeGroup) === "ONE_INCH") oneInchM3 += v;
      const acc = producedBySize.get(l.sizeCode);
      if (acc) acc.m3 += v;
      else producedBySize.set(l.sizeCode, { group: l.sizeGroup as SizeGroup, m3: v });
    }

    // ── Ventes par taille ──
    const soldBySize = new Map<string, number>();
    let salesRevenueCfa = 0;
    let soldM3 = 0;
    for (const l of saleLines) {
      const v = Number(l.volumeM3);
      soldM3 += v;
      salesRevenueCfa += Number(l.amountCfa);
      soldBySize.set(l.sizeCode, (soldBySize.get(l.sizeCode) ?? 0) + v);
    }

    // ── Resciage par taille (entrant = produit plus petit, sortant = consommé) ──
    // Ne touche ni debitedM3 ni le rendement : le resciage ne crée pas de
    // matière depuis les billons, il redistribue le stock entre tailles.
    const resawInBySize = new Map<string, { group: SizeGroup; m3: number }>();
    const resawOutBySize = new Map<string, number>();
    let resawInM3 = 0;
    let resawOutM3 = 0;
    for (const l of resawLines) {
      const v = Number(l.volumeM3);
      if (l.kind === "PRODUCED") {
        resawInM3 += v;
        const acc = resawInBySize.get(l.sizeCode);
        if (acc) acc.m3 += v;
        else resawInBySize.set(l.sizeCode, { group: l.sizeGroup as SizeGroup, m3: v });
      } else {
        resawOutM3 += v;
        resawOutBySize.set(l.sizeCode, (resawOutBySize.get(l.sizeCode) ?? 0) + v);
      }
    }

    // ── Stock produits par taille = produit + rescié entrant − vendu − rescié sortant ──
    const codes = new Set([
      ...producedBySize.keys(),
      ...soldBySize.keys(),
      ...resawInBySize.keys(),
      ...resawOutBySize.keys(),
    ]);
    const stockBySize = [...codes]
      .map((code) => {
        const prod = producedBySize.get(code);
        const producedM3 = prod?.m3 ?? 0;
        const sold = soldBySize.get(code) ?? 0;
        const resawIn = resawInBySize.get(code);
        const rIn = resawIn?.m3 ?? 0;
        const rOut = resawOutBySize.get(code) ?? 0;
        return {
          code,
          group: prod?.group ?? resawIn?.group ?? ("OTHER" as SizeGroup),
          producedM3: producedM3.toFixed(6),
          soldM3: sold.toFixed(6),
          resawnInM3: rIn.toFixed(6),
          resawnOutM3: rOut.toFixed(6),
          stockM3: (producedM3 + rIn - sold - rOut).toFixed(6),
        };
      })
      .sort((a, b) => sizeSortIndex(a.code) - sizeSortIndex(b.code));
    const stockProductsM3 = debitedM3 + resawInM3 - soldM3 - resawOutM3;

    // ── Compta ──
    let fullCost = 0;
    let totalPaid = 0;
    for (const e of entries) {
      if (e.kind === "DUE") fullCost += Number(e.amount);
      else totalPaid += Number(e.amount);
    }

    const quota = Number(contract.quotaM3);

    // ── Estimation camions pour finir le contrat ────────────────────────
    // Moyenne brousse des camions déjà arrivés (mesurés) → nb de camions
    // qu'il faudra encore pour consommer le quota restant. Estimatif : la
    // moyenne s'affine à chaque arrivée. `trucksPlanned` (saisi) reste le
    // chiffre contractuel ; ceci est la projection terrain.
    const avgBrousse = trucksWithBrousse > 0 ? brousseM3 / trucksWithBrousse : 0;
    const remainingQuota = Math.max(quota - brousseM3, 0);
    const estTrucksRemaining =
      avgBrousse > 0 ? Math.ceil(remainingQuota / avgBrousse) : null;
    const estTrucksTotal =
      estTrucksRemaining !== null ? trucksEntered + estTrucksRemaining : null;

    const summary = {
      contractId,
      trucksEntered,
      trucksSawn,
      trucksOnParcUncut,
      trucksRemaining,
      totalUncut,
      avgBrousseM3PerTruck: avgBrousse.toFixed(6),
      estTrucksRemaining,
      estTrucksTotal,
      billeCount,
      billonCount,
      fieldM3: fieldM3.toFixed(6),
      declaredFieldM3: declaredFieldM3.toFixed(6),
      brousseM3: brousseM3.toFixed(6),
      girthM3: girthM3.toFixed(6),
      diaM3: diaM3.toFixed(6),
      debitedM3: debitedM3.toFixed(6),
      sawnGirthM3: sawnGirthM3.toFixed(6),
      outputPct: (sawnGirthM3 > 0 ? (debitedM3 / sawnGirthM3) * 100 : 0).toFixed(4),
      // Quota SODEFOR consommé au cubage brousse (mesuré à l'état brut, sortie forêt).
      quotaUsedPct: (quota > 0 ? (brousseM3 / quota) * 100 : 0).toFixed(4),
      longM3: longM3.toFixed(6),
      shortM3: shortM3.toFixed(6),
      longPct: (debitedM3 > 0 ? (longM3 / debitedM3) * 100 : 0).toFixed(4),
      oneInchPct: (debitedM3 > 0 ? (oneInchM3 / debitedM3) * 100 : 0).toFixed(4),
      girthGte85M3: girthGte85.toFixed(6),
      girthLt85M3: girthLt85.toFixed(6),
      stockBySize,
      stockProductsM3: stockProductsM3.toFixed(6),
      stockParcM3: stockParcM3.toFixed(6),
      salesRevenueCfa: salesRevenueCfa.toFixed(2),
      soldM3: soldM3.toFixed(6),
      fullCost: fullCost.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      balance: (fullCost - totalPaid).toFixed(2),
      profitEstimate: (salesRevenueCfa - fullCost).toFixed(2),
    };
    return (await canSeeFinance(req)) ? summary : redactSummary(summary);
  });

  // Suggestions de dûs (attendu vs existant) pour les tiers assignés
  app.get<{ Params: { id: string } }>(
    "/contracts/:id/account-suggestions",
    async (req, reply) => {
      const contractId = req.params.id;
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        include: {
          sodeforParty: true,
          cubageParty: true,
          transportParty: true,
        },
      });
      if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

      // Ibrahim est payé au cubage diamètre (étalage parc Ø), pas au girth.
      const [trucksEntered, diaAgg, dueEntries] = await Promise.all([
        prisma.truck.count({ where: { contractId } }),
        prisma.log.aggregate({
          where: { measurement: { context: "YARD_DIAMETER", truck: { contractId } } },
          _sum: { volumeM3: true },
        }),
        prisma.accountEntry.groupBy({
          by: ["partyId"],
          where: { contractId, kind: "DUE" },
          _sum: { amount: true },
        }),
      ]);

      const diaM3 = Number(diaAgg._sum.volumeM3 ?? 0);
      const dueByParty = new Map(
        dueEntries.map((e) => [e.partyId, Number(e._sum.amount ?? 0)])
      );

      const out: Array<Record<string, string>> = [];
      const push = (
        party: { id: string; name: string } | null,
        role: string,
        expected: number,
        label: string
      ) => {
        if (!party) return;
        const existingDue = dueByParty.get(party.id) ?? 0;
        const delta = expected - existingDue;
        if (Math.abs(delta) < 0.005) return;
        out.push({
          partyId: party.id,
          partyName: party.name,
          role,
          expected: expected.toFixed(2),
          existingDue: existingDue.toFixed(2),
          delta: delta.toFixed(2),
          label,
        });
      };

      const transportExpected = trucksEntered * Number(contract.transportPrice);
      push(
        contract.transportParty,
        "TRANSPORT",
        transportExpected,
        `Transport ${trucksEntered} camions × ${Number(contract.transportPrice).toLocaleString("fr-FR")}`
      );

      const cubageExpected = diaM3 * Number(contract.ibrahimPrice);
      push(
        contract.cubageParty,
        "CUBAGE",
        cubageExpected,
        `Cubage diamètre ${diaM3.toFixed(3)} m³ ×${Number(contract.ibrahimPrice).toLocaleString("fr-FR")}`
      );

      const sodeforExpected =
        Number(contract.feeSodeforR) +
        Number(contract.feeSodeforPlus) +
        Number(contract.feeReforestation);
      push(contract.sodeforParty, "SODEFOR", sodeforExpected, "Frais SODEFOR (R + + reboisement)");

      return out;
    }
  );
}
