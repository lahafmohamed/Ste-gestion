import { GIRTH_SPLIT_CM, sizeSortIndex } from "@ste/shared";
import type {
  ParcTruckDTO,
  SizeGroup,
  StockSizeRowDTO,
  StockSummaryDTO,
} from "@ste/shared";
import { prisma } from "./prisma.js";

// ── Stock général ─────────────────────────────────────────────────────
// Le stock n'appartient à aucun contrat : le débité de tous les contrats tombe
// dans le même stock, et l'empotage y puise sans choisir de contrat. Les mêmes
// calculs servent filtrés par contrat (fiche contrat) ou non (page Stock) —
// `contractId` absent = tous contrats confondus.

/** Filtre Prisma « ce contrat » ou rien (tous). */
const scope = (contractId?: string) => (contractId ? { contractId } : {});

/** Parc : billons girth restants (non sciés), camion par camion. */
export async function parcStock(contractId?: string): Promise<{
  totalM3: number;
  rows: ParcTruckDTO[];
}> {
  const truckWhere = contractId ? { contractId } : {};
  const [trucks, logs, runTruckLinks, runLogLinks] = await Promise.all([
    prisma.truck.findMany({
      where: truckWhere,
      orderBy: { arrivedAt: "asc" },
      select: {
        id: true,
        registration: true,
        deliveryNote: true,
        arrivedAt: true,
        contractId: true,
        contract: { select: { code: true } },
      },
    }),
    prisma.log.findMany({
      where: { measurement: { context: "YARD_GIRTH", truck: truckWhere } },
      select: {
        id: true,
        volumeM3: true,
        circumferenceCm: true,
        measurement: { select: { truckId: true } },
      },
    }),
    prisma.productionRunTruck.findMany({
      where: { truck: truckWhere },
      select: { runId: true, truckId: true },
    }),
    prisma.productionRunLog.findMany({
      where: { log: { measurement: { truck: truckWhere } } },
      select: {
        runId: true,
        logId: true,
        log: { select: { measurement: { select: { truckId: true } } } },
      },
    }),
  ]);

  // Un camion lié à une session SANS billes précisées = camion entier scié
  // (comportement historique). Sinon : reste = girth − billes sciées.
  const sawnLogIds = new Set(runLogLinks.map((l) => l.logId));
  const runsWithBillesByTruck = new Map<string, Set<string>>();
  for (const l of runLogLinks) {
    const tid = l.log.measurement.truckId;
    let set = runsWithBillesByTruck.get(tid);
    if (!set) {
      set = new Set();
      runsWithBillesByTruck.set(tid, set);
    }
    set.add(l.runId);
  }
  const wholeTruckSawn = new Set<string>();
  for (const rt of runTruckLinks) {
    if (!runsWithBillesByTruck.get(rt.truckId)?.has(rt.runId)) wholeTruckSawn.add(rt.truckId);
  }

  type Acc = { m3: number; gte85: number; lt85: number; count: number };
  const byTruck = new Map<string, Acc>();
  for (const l of logs) {
    const tid = l.measurement.truckId;
    if (wholeTruckSawn.has(tid) || sawnLogIds.has(l.id)) continue; // parti au sciage
    let a = byTruck.get(tid);
    if (!a) {
      a = { m3: 0, gte85: 0, lt85: 0, count: 0 };
      byTruck.set(tid, a);
    }
    const v = Number(l.volumeM3);
    a.m3 += v;
    a.count += 1;
    if (Number(l.circumferenceCm ?? 0) >= GIRTH_SPLIT_CM) a.gte85 += v;
    else a.lt85 += v;
  }

  let totalM3 = 0;
  const rows: ParcTruckDTO[] = [];
  for (const t of trucks) {
    const a = byTruck.get(t.id);
    if (!a || a.m3 <= 0) continue;
    totalM3 += a.m3;
    rows.push({
      truckId: t.id,
      contractId: t.contractId,
      contractCode: t.contract.code,
      registration: t.registration,
      deliveryNote: t.deliveryNote,
      arrivedAt: t.arrivedAt.toISOString(),
      billonCount: a.count,
      girthM3: a.m3.toFixed(6),
      girthGte85M3: a.gte85.toFixed(6),
      girthLt85M3: a.lt85.toFixed(6),
    });
  }
  return { totalM3, rows };
}

/**
 * Stock produits par taille, vue par contrat (fiche contrat, ventes) :
 * produit + rescié entrant − vendu − rescié sortant. La page Stock, elle,
 * suit le journal (stock-ledger.ts) : inventaire, empotage et sorties compris.
 */
export async function stockSummary(contractId?: string): Promise<StockSummaryDTO> {
  const [sawnLines, saleLines, resawLines, parc] = await Promise.all([
    prisma.sawnLine.findMany({
      where: { run: scope(contractId) },
      select: { sizeCode: true, sizeGroup: true, volumeM3: true },
    }),
    prisma.saleLine.findMany({
      where: { sale: scope(contractId) },
      select: { sizeCode: true, volumeM3: true },
    }),
    prisma.resawLine.findMany({
      where: { op: scope(contractId) },
      select: { kind: true, sizeCode: true, sizeGroup: true, volumeM3: true },
    }),
    parcStock(contractId),
  ]);

  const producedBySize = new Map<string, { group: SizeGroup; m3: number }>();
  let debitedM3 = 0;
  for (const l of sawnLines) {
    const v = Number(l.volumeM3);
    debitedM3 += v;
    const acc = producedBySize.get(l.sizeCode);
    if (acc) acc.m3 += v;
    else producedBySize.set(l.sizeCode, { group: l.sizeGroup as SizeGroup, m3: v });
  }

  const soldBySize = new Map<string, number>();
  let soldM3 = 0;
  for (const l of saleLines) {
    const v = Number(l.volumeM3);
    soldM3 += v;
    soldBySize.set(l.sizeCode, (soldBySize.get(l.sizeCode) ?? 0) + v);
  }

  // Le resciage ne crée pas de matière : il redistribue le stock entre tailles.
  const resawInBySize = new Map<string, { group: SizeGroup; m3: number }>();
  const resawOutBySize = new Map<string, number>();
  let resawnInM3 = 0;
  let resawnOutM3 = 0;
  for (const l of resawLines) {
    const v = Number(l.volumeM3);
    if (l.kind === "PRODUCED") {
      resawnInM3 += v;
      const acc = resawInBySize.get(l.sizeCode);
      if (acc) acc.m3 += v;
      else resawInBySize.set(l.sizeCode, { group: l.sizeGroup as SizeGroup, m3: v });
    } else {
      resawnOutM3 += v;
      resawOutBySize.set(l.sizeCode, (resawOutBySize.get(l.sizeCode) ?? 0) + v);
    }
  }

  const codes = new Set([
    ...producedBySize.keys(),
    ...soldBySize.keys(),
    ...resawInBySize.keys(),
    ...resawOutBySize.keys(),
  ]);
  const stockBySize: StockSizeRowDTO[] = [...codes]
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

  return {
    stockBySize,
    stockProductsM3: (debitedM3 + resawnInM3 - soldM3 - resawnOutM3).toFixed(6),
    stockParcM3: parc.totalM3.toFixed(6),
    debitedM3: debitedM3.toFixed(6),
    resawnInM3: resawnInM3.toFixed(6),
    resawnOutM3: resawnOutM3.toFixed(6),
    soldM3: soldM3.toFixed(6),
  };
}

// Le stock par dimension (page Stock, panier d'empotage) et le suivi par
// épaisseur vivent dans stock-ledger.ts : dernier inventaire + entrées − sorties.
