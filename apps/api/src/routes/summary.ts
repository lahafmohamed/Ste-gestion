import type { FastifyInstance } from "fastify";
import type { SizeGroup } from "@ste/shared";
import { GIRTH_SPLIT_CM, LONG_SPLIT_FT, billCount, sizeSortIndex } from "@ste/shared";
import { prisma } from "../prisma.js";

export async function summaryRoutes(app: FastifyInstance) {
  // Vue liste — ce dont les cartes de la page Contrats ont besoin, pour tous
  // les contrats d'un coup : 3 requêtes au total, au lieu du résumé complet
  // (7 requêtes) répété une fois par contrat.
  // Route statique : elle passe avant `/contracts/:id` côté routeur Fastify.
  app.get("/contracts/overview", async () => {
    const [contracts, trucks, fieldLogs] = await Promise.all([
      prisma.contract.findMany({ select: { id: true, quotaM3: true } }),
      prisma.truck.findMany({
        select: {
          id: true,
          contractId: true,
          declaredFieldM3: true,
          packingLogs: { select: { volumeM3: true } },
        },
      }),
      prisma.log.findMany({
        where: { measurement: { context: "FIELD" } },
        select: { volumeM3: true, measurement: { select: { truckId: true } } },
      }),
    ]);

    const fieldByTruck = new Map<string, number>();
    for (const l of fieldLogs) {
      const tid = l.measurement.truckId;
      fieldByTruck.set(tid, (fieldByTruck.get(tid) ?? 0) + Number(l.volumeM3));
    }

    // Brousse par camion : même ordre de préférence que le résumé complet
    // (étalage brousse 1-par-1 → packing list → total déclaré au bordereau).
    const acc = new Map<string, { trucks: number; brousse: number; measured: number }>();
    for (const c of contracts) acc.set(c.id, { trucks: 0, brousse: 0, measured: 0 });
    for (const t of trucks) {
      const a = acc.get(t.contractId);
      if (!a) continue;
      const field = fieldByTruck.get(t.id) ?? 0;
      const packing = t.packingLogs.reduce((s, p) => s + Number(p.volumeM3), 0);
      const v = field > 0 ? field : packing > 0 ? packing : Number(t.declaredFieldM3 ?? 0);
      a.trucks += 1;
      a.brousse += v;
      if (v > 0) a.measured += 1;
    }

    return contracts.map((c) => {
      const a = acc.get(c.id)!;
      const avg = a.measured > 0 ? a.brousse / a.measured : 0;
      const remainingQuota = Math.max(Number(c.quotaM3) - a.brousse, 0);
      const estTrucksRemaining = avg > 0 ? Math.ceil(remainingQuota / avg) : null;
      return {
        contractId: c.id,
        trucksEntered: a.trucks,
        brousseM3: a.brousse.toFixed(6),
        estTrucksTotal: estTrucksRemaining !== null ? a.trucks + estTrucksRemaining : null,
      };
    });
  });

  // Résumé dérivé complet du contrat
  app.get<{ Params: { id: string } }>("/contracts/:id/summary", async (req, reply) => {
    const contractId = req.params.id;
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

    const [trucks, logs, sawnLines, saleLines, entries, runTruckLinks, runLogLinks] =
      await Promise.all([
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
    for (const [tid, v] of girthByTruck) {
      if (wholeTruckSawn.has(tid)) continue; // tout parti au sciage
      stockParcM3 += Math.max(v - (sawnGirthByTruck.get(tid) ?? 0), 0);
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

    // ── Stock produits par taille = produit − vendu ──
    const codes = new Set([...producedBySize.keys(), ...soldBySize.keys()]);
    const stockBySize = [...codes]
      .map((code) => {
        const prod = producedBySize.get(code);
        const producedM3 = prod?.m3 ?? 0;
        const sold = soldBySize.get(code) ?? 0;
        return {
          code,
          group: prod?.group ?? ("OTHER" as SizeGroup),
          producedM3: producedM3.toFixed(6),
          soldM3: sold.toFixed(6),
          stockM3: (producedM3 - sold).toFixed(6),
        };
      })
      .sort((a, b) => sizeSortIndex(a.code) - sizeSortIndex(b.code));
    const stockProductsM3 = debitedM3 - soldM3;

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

    return {
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
      outputPct: (girthM3 > 0 ? (debitedM3 / girthM3) * 100 : 0).toFixed(4),
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

      const [trucksEntered, girthAgg, dueEntries] = await Promise.all([
        prisma.truck.count({ where: { contractId } }),
        prisma.log.aggregate({
          where: { measurement: { context: "YARD_GIRTH", truck: { contractId } } },
          _sum: { volumeM3: true },
        }),
        prisma.accountEntry.groupBy({
          by: ["partyId"],
          where: { contractId, kind: "DUE" },
          _sum: { amount: true },
        }),
      ]);

      const girthM3 = Number(girthAgg._sum.volumeM3 ?? 0);
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

      const cubageExpected = girthM3 * Number(contract.ibrahimPrice);
      push(
        contract.cubageParty,
        "CUBAGE",
        cubageExpected,
        `Cubage ${girthM3.toFixed(3)} m³ × ${Number(contract.ibrahimPrice).toLocaleString("fr-FR")}`
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
