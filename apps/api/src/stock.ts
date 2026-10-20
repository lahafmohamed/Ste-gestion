import { GIRTH_SPLIT_CM, sawnVolumeM3, sizeSortIndex } from "@ste/shared";
import type {
  ParcTruckDTO,
  SawnInventoryRowDTO,
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

/** Stock produits par taille : produit + rescié entrant − vendu − rescié sortant. */
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

// Stock d'avivés à la granularité L×l×ép — base du panier d'empotage.
// Les ventes (m³ par taille, sans dimensions ni nombre de pièces) ne sont pas
// déductibles ici : ce stock est celui du bois physique disponible à empoter.
export async function sawnInventory(contractId?: string): Promise<SawnInventoryRowDTO[]> {
  const dims = {
    lengthFt: true,
    widthIn: true,
    thicknessIn: true,
    count: true,
    sizeCode: true,
    sizeGroup: true,
  } as const;

  const [sawn, resaw, packed] = await Promise.all([
    prisma.sawnLine.findMany({ where: { run: scope(contractId) }, select: dims }),
    prisma.resawLine.findMany({
      where: { op: scope(contractId) },
      select: { ...dims, kind: true },
    }),
    prisma.containerItem.findMany({
      where: { container: scope(contractId) },
      select: dims,
    }),
  ]);

  type Row = {
    key: string;
    lengthFt: number;
    widthIn: number;
    thicknessIn: number;
    sizeCode: string;
    sizeGroup: SizeGroup;
    producedCount: number;
    resawnInCount: number;
    resawnOutCount: number;
    packedCount: number;
  };
  const rows = new Map<string, Row>();
  const bucket = (l: {
    lengthFt: unknown;
    widthIn: unknown;
    thicknessIn: unknown;
    sizeCode: string;
    sizeGroup: string;
  }) => {
    const L = Number(l.lengthFt);
    const w = Number(l.widthIn);
    const t = Number(l.thicknessIn);
    const key = `${L}x${w}x${t}`;
    let r = rows.get(key);
    if (!r) {
      r = {
        key,
        lengthFt: L,
        widthIn: w,
        thicknessIn: t,
        sizeCode: l.sizeCode,
        sizeGroup: l.sizeGroup as SizeGroup,
        producedCount: 0,
        resawnInCount: 0,
        resawnOutCount: 0,
        packedCount: 0,
      };
      rows.set(key, r);
    }
    return r;
  };

  for (const l of sawn) bucket(l).producedCount += l.count;
  for (const l of resaw) {
    const r = bucket(l);
    if (l.kind === "PRODUCED") r.resawnInCount += l.count;
    else r.resawnOutCount += l.count;
  }
  for (const l of packed) bucket(l).packedCount += l.count;

  return [...rows.values()]
    .map((r) => {
      const available = r.producedCount + r.resawnInCount - r.resawnOutCount - r.packedCount;
      const unit = sawnVolumeM3(r.lengthFt, r.widthIn, r.thicknessIn, 1);
      return {
        key: r.key,
        lengthFt: String(r.lengthFt),
        widthIn: String(r.widthIn),
        thicknessIn: String(r.thicknessIn),
        sizeCode: r.sizeCode,
        sizeGroup: r.sizeGroup,
        producedCount: r.producedCount,
        resawnInCount: r.resawnInCount,
        resawnOutCount: r.resawnOutCount,
        packedCount: r.packedCount,
        availableCount: available,
        unitM3: unit.toFixed(6),
        availableM3: (unit * available).toFixed(6),
      };
    })
    .sort(
      (a, b) =>
        sizeSortIndex(a.sizeCode) - sizeSortIndex(b.sizeCode) ||
        Number(a.lengthFt) - Number(b.lengthFt)
    );
}
