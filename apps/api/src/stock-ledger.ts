import {
  classifySize,
  LEDGER_KIND_ORDER,
  LEDGER_KIND_SIGN,
  sawnVolumeM3,
  sizeSortIndex,
  stockKey,
  suiviColumnKey,
  suiviColumnIndex,
  suiviVisibleColumns,
  type LedgerKind,
  type LedgerRowDTO,
  type Quality,
  type StockLedgerDTO,
  type StockRowDTO,
} from "@ste/shared";
import { prisma } from "./prisma.js";

// ── Journal du stock d'avivés ─────────────────────────────────────────
// Une seule source pour la page Stock, le suivi par épaisseur, les exports
// et le panier d'empotage :
//   dernier inventaire
//   + sciage (sessions de débitage) + nouvelle mesure (resciage produit)
//   − empotage (conteneurs en empotage / empotés / expédiés)
//   − livraisons, ventes, séchoir, menuiserie, rejets (mouvements saisis)
//   − ancienne mesure (resciage consommé).
// L'inventaire fixe le stock au matin de son jour : un mouvement daté du
// même jour ou après compte, un mouvement antérieur est déjà dans le
// comptage. Sans inventaire, tout l'historique compte (stock parti de zéro).
// Un conteneur encore « Prévu » ne sort pas du stock : ses pièces sont
// seulement réservées (le panier d'empotage ne peut plus les reprendre).

type Piece = {
  L: number;
  w: number;
  t: number;
  count: number;
  quality: Quality;
  volumeM3: number;
};

export type LedgerEntry = {
  kind: LedgerKind;
  sourceId: string;
  date: Date;
  createdAt: Date;
  reference: string | null;
  note: string | null;
  pieces: Piece[];
};

const lineSelect = {
  lengthFt: true,
  widthIn: true,
  thicknessIn: true,
  count: true,
  quality: true,
  volumeM3: true,
} as const;

function piece(l: {
  lengthFt: unknown;
  widthIn: unknown;
  thicknessIn: unknown;
  count: number;
  quality: string;
  volumeM3: unknown;
}): Piece {
  return {
    L: Number(l.lengthFt),
    w: Number(l.widthIn),
    t: Number(l.thicknessIn),
    count: l.count,
    quality: l.quality as Quality,
    volumeM3: Number(l.volumeM3),
  };
}

/** Début du jour (UTC = heure d'Abidjan) : l'inventaire vaut au matin. */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Les camions sciés, par leur B/L (le « N° CBG » du suivi), sinon l'immat. */
function truckRef(trucks: { truck: { deliveryNote: string | null; registration: string } }[]) {
  const refs = trucks.map((t) => t.truck.deliveryNote || t.truck.registration).filter(Boolean);
  return refs.length ? [...new Set(refs)].join(" · ") : null;
}

export async function latestInventory() {
  return prisma.stockMovement.findFirst({
    where: { kind: "INVENTAIRE" },
    orderBy: [{ movedAt: "desc" }, { createdAt: "desc" }],
    include: { lines: { select: lineSelect, orderBy: { position: "asc" } } },
  });
}

/** Tous les mouvements qui comptent depuis le dernier inventaire. */
export async function ledgerEntries(): Promise<{
  inventory: Awaited<ReturnType<typeof latestInventory>>;
  entries: LedgerEntry[];
  reserved: Piece[];
}> {
  const inventory = await latestInventory();
  const cutoff = inventory ? startOfDay(inventory.movedAt) : undefined;
  const since = cutoff ? { gte: cutoff } : undefined;

  const [runs, resaws, containers, movements] = await Promise.all([
    prisma.productionRun.findMany({
      where: { producedAt: since },
      select: {
        id: true,
        producedAt: true,
        createdAt: true,
        note: true,
        lines: { select: lineSelect },
        trucks: { select: { truck: { select: { deliveryNote: true, registration: true } } } },
      },
    }),
    prisma.resawOp.findMany({
      where: { resawnAt: since },
      select: {
        id: true,
        resawnAt: true,
        createdAt: true,
        note: true,
        lines: { select: { ...lineSelect, kind: true } },
      },
    }),
    // Tous les conteneurs : la date qui compte (chargement) n'est pas un
    // champ filtrable seul, et les « Prévu » réservent quelle que soit leur date.
    prisma.container.findMany({
      select: {
        id: true,
        containerNo: true,
        grade: true,
        destination: true,
        status: true,
        loadedAt: true,
        createdAt: true,
        items: { select: lineSelect },
      },
    }),
    prisma.stockMovement.findMany({
      where: { kind: { not: "INVENTAIRE" }, movedAt: since },
      select: {
        id: true,
        kind: true,
        movedAt: true,
        createdAt: true,
        reference: true,
        note: true,
        lines: { select: lineSelect },
      },
    }),
  ]);

  const entries: LedgerEntry[] = [];
  if (inventory) {
    entries.push({
      kind: "INVENTAIRE",
      sourceId: inventory.id,
      date: inventory.movedAt,
      createdAt: inventory.createdAt,
      reference: inventory.reference,
      note: inventory.note,
      pieces: inventory.lines.map(piece),
    });
  }
  for (const r of runs) {
    entries.push({
      kind: "SCIAGE",
      sourceId: r.id,
      date: r.producedAt,
      createdAt: r.createdAt,
      reference: truckRef(r.trucks),
      note: r.note,
      pieces: r.lines.map(piece),
    });
  }
  for (const o of resaws) {
    const base = { sourceId: o.id, date: o.resawnAt, createdAt: o.createdAt, reference: null, note: o.note };
    const consumed = o.lines.filter((l) => l.kind === "CONSUMED").map(piece);
    const produced = o.lines.filter((l) => l.kind === "PRODUCED").map(piece);
    if (consumed.length) entries.push({ ...base, kind: "RECUTTING_OUT", pieces: consumed });
    if (produced.length) entries.push({ ...base, kind: "RECUTTING_IN", pieces: produced });
  }
  const reserved: Piece[] = [];
  for (const c of containers) {
    if (c.items.length === 0) continue;
    if (c.status === "PLANNED") {
      reserved.push(...c.items.map(piece));
      continue;
    }
    const date = c.loadedAt ?? c.createdAt;
    if (cutoff && date < cutoff) continue;
    entries.push({
      kind: "EMPOTAGE",
      sourceId: c.id,
      date,
      createdAt: c.createdAt,
      reference: c.containerNo,
      note: [c.grade, c.destination].filter(Boolean).join(" · ") || null,
      pieces: c.items.map(piece),
    });
  }
  for (const m of movements) {
    entries.push({
      kind: m.kind,
      sourceId: m.id,
      date: m.movedAt,
      createdAt: m.createdAt,
      reference: m.reference,
      note: m.note,
      pieces: m.lines.map(piece),
    });
  }

  entries.sort(
    (a, b) =>
      startOfDay(a.date).getTime() - startOfDay(b.date).getTime() ||
      LEDGER_KIND_ORDER.indexOf(a.kind) - LEDGER_KIND_ORDER.indexOf(b.kind) ||
      a.date.getTime() - b.date.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime()
  );
  return { inventory, entries, reserved };
}

/** Suivi par épaisseur : une ligne par mouvement, m³ ventilés par colonne. */
export async function stockLedger(): Promise<StockLedgerDTO> {
  const { inventory, entries } = await ledgerEntries();
  const used = new Set<string>();
  const totalsBy: Record<string, number> = {};
  let totalM3 = 0;
  let totalPieces = 0;

  const rows: LedgerRowDTO[] = entries.map((e) => {
    const sign = LEDGER_KIND_SIGN[e.kind];
    const by: Record<string, number> = {};
    let m3 = 0;
    let pieces = 0;
    for (const p of e.pieces) {
      const key = suiviColumnKey(p.w, p.t, p.quality);
      used.add(key);
      by[key] = (by[key] ?? 0) + sign * p.volumeM3;
      m3 += sign * p.volumeM3;
      pieces += sign * p.count;
    }
    for (const [k, v] of Object.entries(by)) totalsBy[k] = (totalsBy[k] ?? 0) + v;
    totalM3 += m3;
    totalPieces += pieces;
    return {
      key: `${e.kind}:${e.sourceId}`,
      kind: e.kind,
      sourceId: e.sourceId,
      date: e.date.toISOString(),
      reference: e.reference,
      note: e.note,
      volumeM3: m3.toFixed(6),
      pieces,
      byColumn: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.toFixed(6)])),
    };
  });

  const inventoryM3 = inventory
    ? inventory.lines.reduce((s, l) => s + Number(l.volumeM3), 0)
    : 0;
  return {
    inventory: inventory
      ? {
          id: inventory.id,
          movedAt: inventory.movedAt.toISOString(),
          totalM3: inventoryM3.toFixed(6),
        }
      : null,
    columns: suiviVisibleColumns(used),
    rows,
    totals: {
      volumeM3: totalM3.toFixed(6),
      pieces: totalPieces,
      byColumn: Object.fromEntries(
        Object.entries(totalsBy).map(([k, v]) => [k, v.toFixed(6)])
      ),
    },
  };
}

type Counter =
  | "inventoryCount"
  | "producedCount"
  | "resawnInCount"
  | "resawnOutCount"
  | "packedCount"
  | "otherOutCount"
  | "reservedCount";

const COUNTER_BY_KIND: Record<LedgerKind, Counter> = {
  INVENTAIRE: "inventoryCount",
  SCIAGE: "producedCount",
  RECUTTING_IN: "resawnInCount",
  RECUTTING_OUT: "resawnOutCount",
  EMPOTAGE: "packedCount",
  LIVRAISON: "otherOutCount",
  VENTE: "otherOutCount",
  SECHOIR: "otherOutCount",
  MENUISERIE: "otherOutCount",
  REJET: "otherOutCount",
};

/** Stock par dimension et qualité (le tableau STOCK du client). */
export async function stockRows(): Promise<StockRowDTO[]> {
  const { entries, reserved } = await ledgerEntries();
  type Acc = Record<Counter, number> & { L: number; w: number; t: number; quality: Quality };
  const rows = new Map<string, Acc>();
  const bucket = (p: Piece) => {
    const key = stockKey(p.L, p.w, p.t, p.quality);
    let r = rows.get(key);
    if (!r) {
      r = {
        L: p.L,
        w: p.w,
        t: p.t,
        quality: p.quality,
        inventoryCount: 0,
        producedCount: 0,
        resawnInCount: 0,
        resawnOutCount: 0,
        packedCount: 0,
        otherOutCount: 0,
        reservedCount: 0,
      };
      rows.set(key, r);
    }
    return r;
  };
  for (const e of entries) {
    const counter = COUNTER_BY_KIND[e.kind];
    for (const p of e.pieces) bucket(p)[counter] += p.count;
  }
  for (const p of reserved) bucket(p).reservedCount += p.count;

  return [...rows.entries()]
    .map(([key, r]) => {
      const stock =
        r.inventoryCount +
        r.producedCount +
        r.resawnInCount -
        r.resawnOutCount -
        r.packedCount -
        r.otherOutCount;
      const available = stock - r.reservedCount;
      const unit = sawnVolumeM3(r.L, r.w, r.t, 1);
      const size = classifySize(r.w, r.t);
      return {
        key,
        lengthFt: String(r.L),
        widthIn: String(r.w),
        thicknessIn: String(r.t),
        quality: r.quality,
        sizeCode: size.code,
        sizeGroup: size.group,
        suiviKey: suiviColumnKey(r.w, r.t, r.quality),
        inventoryCount: r.inventoryCount,
        producedCount: r.producedCount,
        resawnInCount: r.resawnInCount,
        resawnOutCount: r.resawnOutCount,
        packedCount: r.packedCount,
        otherOutCount: r.otherOutCount,
        stockCount: stock,
        reservedCount: r.reservedCount,
        availableCount: available,
        unitM3: unit.toFixed(6),
        stockM3: (unit * stock).toFixed(6),
        availableM3: (unit * available).toFixed(6),
      };
    })
    .sort(
      (a, b) =>
        suiviColumnIndex(a.suiviKey) - suiviColumnIndex(b.suiviKey) ||
        sizeSortIndex(a.sizeCode) - sizeSortIndex(b.sizeCode) ||
        Number(b.widthIn) - Number(a.widthIn) ||
        Number(b.thicknessIn) - Number(a.thicknessIn) ||
        Number(b.lengthFt) - Number(a.lengthFt)
    );
}
