import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  contractExpenseCreateSchema,
  expenseTransferSchema,
  paymentVoucherCreateSchema,
  voucherNumber,
  type ComputedExpenseDTO,
  type ExpenseRowDTO,
  type PaymentVoucherDTO,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { ensureContractOpen } from "../contract-lock.js";

// ── Dépenses du contrat ─────────────────────────────────────────────────
// Les paramètres de prix (termes) ne servaient qu'aux suggestions de dûs.
// Ici ils deviennent des lignes de dépense calculées sur les quantités
// réalisées (F7/F8) ; les dépenses imprévues s'ajoutent à la main en dessous.
//
// Unités (FORMULAS.md F7) :
//   SODEFOR   × m³ brousse (ce qui sort de la forêt)
//   Ibrahim   × m³ étalé Ø (cubage parc au diamètre — truckCostCfa)
//   Transport × camions entrés          Sous-cubage × camions entrés
//   1"        × m³ de 1" débité
// Company / Export retirés des paramètres de prix (2026-10-21) : plus de ligne.
// Frais SODEFOR (R, +, reboisement) retirés de la fiche (2026-10-26) : la ligne
// ne reste que si le contrat en avait un montant ou un règlement (historique).

/** Quantités réalisées du contrat, mêmes règles que le résumé. */
async function contractQuantities(contractId: string) {
  const [trucks, logs, sawnLines] = await Promise.all([
    prisma.truck.findMany({
      where: { contractId },
      select: { id: true, declaredFieldM3: true, packingLogs: { select: { volumeM3: true } } },
    }),
    prisma.log.findMany({
      where: {
        measurement: { truck: { contractId }, context: { in: ["FIELD", "YARD_DIAMETER"] } },
      },
      select: { volumeM3: true, measurement: { select: { context: true, truckId: true } } },
    }),
    prisma.sawnLine.findMany({
      where: { run: { contractId } },
      select: { volumeM3: true, sizeGroup: true },
    }),
  ]);

  const fieldByTruck = new Map<string, number>();
  let diaM3 = 0;
  for (const l of logs) {
    const v = Number(l.volumeM3);
    if (l.measurement.context === "FIELD") {
      const tid = l.measurement.truckId;
      fieldByTruck.set(tid, (fieldByTruck.get(tid) ?? 0) + v);
    } else {
      diaM3 += v;
    }
  }

  // Brousse par camion : étalage brousse 1-par-1 → packing list → déclaré.
  let brousseM3 = 0;
  for (const t of trucks) {
    const field = fieldByTruck.get(t.id) ?? 0;
    const packing = t.packingLogs.reduce((s, p) => s + Number(p.volumeM3), 0);
    brousseM3 += field > 0 ? field : packing > 0 ? packing : Number(t.declaredFieldM3 ?? 0);
  }

  let oneInchM3 = 0;
  for (const l of sawnLines) {
    if (l.sizeGroup === "ONE_INCH") oneInchM3 += Number(l.volumeM3);
  }

  return { trucksEntered: trucks.length, brousseM3, diaM3, oneInchM3 };
}

type PricedContract = {
  id: string;
  sodeforPrice: Prisma.Decimal;
  ibrahimPrice: Prisma.Decimal;
  transportPrice: Prisma.Decimal;
  cubagePrice: Prisma.Decimal;
  oneInchPrice: Prisma.Decimal;
  feeSodeforR: Prisma.Decimal;
  feeSodeforPlus: Prisma.Decimal;
  feeReforestation: Prisma.Decimal;
};

type ComputedLine = ComputedExpenseDTO & { vouchers: { id: string; number: string }[] };

/** Libellés des postes calculés — repris sur les lignes des bons. */
const COMPUTED_LABELS: Record<ComputedExpenseDTO["key"], string> = {
  SODEFOR: "SODEFOR",
  IBRAHIM: "Ibrahim (cubage)",
  TRANSPORT: "Transport",
  CUBAGE: "Sous-cubage",
  ONE_INCH: "1\"",
  FEE_SODEFOR_R: "SODEFOR & R",
  FEE_SODEFOR_PLUS: "SODEFOR +",
  FEE_REFORESTATION: "Reboisement",
};

/** Lignes calculées d'un contrat (prix × quantités réalisées), paiements cumulés joints. */
async function computedLines(contract: PricedContract): Promise<ComputedLine[]> {
  const [q, payments] = await Promise.all([
    contractQuantities(contract.id),
    prisma.expensePayment.findMany({
      where: { contractId: contract.id, key: { not: null } },
      orderBy: { paidAt: "asc" },
      select: { key: true, amount: true, paidAt: true, voucher: { select: { id: true, seq: true } } },
    }),
  ]);
  const paidByKey = new Map<
    string,
    { amount: number; paidAt: Date; vouchers: { id: string; number: string }[] }
  >();
  for (const p of payments) {
    if (!p.key) continue;
    const cur = paidByKey.get(p.key) ?? { amount: 0, paidAt: p.paidAt, vouchers: [] };
    cur.amount += Number(p.amount);
    if (p.paidAt > cur.paidAt) cur.paidAt = p.paidAt;
    if (!cur.vouchers.some((v) => v.id === p.voucher.id)) {
      cur.vouchers.push({ id: p.voucher.id, number: voucherNumber(p.voucher.seq) });
    }
    paidByKey.set(p.key, cur);
  }

  const computed: ComputedLine[] = [];
  const line = (
    key: ComputedExpenseDTO["key"],
    quantity: number | null,
    unit: string | null,
    unitPrice: Prisma.Decimal
  ) => {
    const price = Number(unitPrice);
    const p = paidByKey.get(key);
    if (key.startsWith("FEE_") && price === 0 && !p) return;
    const amount = quantity === null ? price : quantity * price;
    computed.push({
      key,
      label: COMPUTED_LABELS[key],
      quantity: quantity === null ? null : quantity.toFixed(6),
      unit,
      unitPrice: price.toFixed(2),
      amount: amount.toFixed(2),
      priced: price > 0,
      payment: p ? { amount: p.amount.toFixed(2), paidAt: p.paidAt.toISOString() } : null,
      vouchers: p?.vouchers ?? [],
    });
  };

  line("SODEFOR", q.brousseM3, "m³ brousse", contract.sodeforPrice);
  line("IBRAHIM", q.diaM3, "m³ diamètre", contract.ibrahimPrice);
  line("TRANSPORT", q.trucksEntered, "camions", contract.transportPrice);
  line("CUBAGE", q.trucksEntered, "camions", contract.cubagePrice);
  line("ONE_INCH", q.oneInchM3, "m³ de 1\"", contract.oneInchPrice);
  line("FEE_SODEFOR_R", null, null, contract.feeSodeforR);
  line("FEE_SODEFOR_PLUS", null, null, contract.feeSodeforPlus);
  line("FEE_REFORESTATION", null, null, contract.feeReforestation);
  return computed;
}

/** Reste à payer (négatif = payé au-delà) ; les centimes d'arrondi ne comptent pas. */
function dueOf(amount: number, paid: number): number {
  const d = amount - paid;
  return Math.abs(d) < 1 ? 0 : d;
}

/** Cumul des règlements d'une dépense ajoutée. */
function sumPayments(payments: { amount: Prisma.Decimal; paidAt: Date }[]) {
  if (payments.length === 0) return null;
  let amount = 0;
  let paidAt = payments[0].paidAt;
  for (const p of payments) {
    amount += Number(p.amount);
    if (p.paidAt > paidAt) paidAt = p.paidAt;
  }
  return { amount, paidAt };
}

/** Quantité lisible (détail de ligne de la page Dépenses). */
function qtyDetail(l: ComputedExpenseDTO): string {
  if (l.quantity === null) return "forfait";
  const n = Number(l.quantity);
  const v =
    l.unit === "camions"
      ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
      : n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${v} ${l.unit}`;
}

export async function expenseRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/contracts/:id/expenses", async (req, reply) => {
    const contractId = req.params.id;
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

    const [lines, extraRaw] = await Promise.all([
      computedLines(contract),
      prisma.contractExpense.findMany({
        where: { contractId },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        include: { payments: { select: { amount: true, paidAt: true } } },
      }),
    ]);
    const extra = extraRaw.map(({ payments, ...e }) => {
      const p = sumPayments(payments);
      return {
        ...e,
        payment: p ? { amount: p.amount.toFixed(2), paidAt: p.paidAt.toISOString() } : null,
      };
    });

    const computed: ComputedExpenseDTO[] = lines.map(({ vouchers: _v, ...l }) => l);
    const computedTotal = computed.reduce((s, l) => s + Number(l.amount), 0);
    const extraTotal = extra.reduce((s, e) => s + Number(e.amount), 0);

    return {
      contractId,
      computed,
      computedTotal: computedTotal.toFixed(2),
      extra,
      extraTotal: extraTotal.toFixed(2),
      total: (computedTotal + extraTotal).toFixed(2),
    };
  });

  // ── Toutes les dépenses, tous contrats (page Dépenses) ──────────────────
  // Postes calculés à montant nul (prix non renseigné, rien de réalisé) omis :
  // rien à payer. Un poste payé reste listé même si son montant retombe à 0.
  app.get("/expenses", async () => {
    const contracts = await prisma.contract.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        expenses: {
          orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
          include: {
            payments: {
              select: { amount: true, paidAt: true, voucher: { select: { id: true, seq: true } } },
            },
          },
        },
      },
    });
    const perContract = await Promise.all(
      contracts.map(async (c) => {
        const rows: ExpenseRowDTO[] = [];
        for (const l of await computedLines(c)) {
          const amount = Number(l.amount);
          if (amount <= 0 && !l.payment) continue;
          const paid = l.payment ? Number(l.payment.amount) : 0;
          rows.push({
            rowId: `c:${c.id}:${l.key}`,
            kind: "computed",
            contractId: c.id,
            contractCode: c.code,
            contractStatus: c.status,
            key: l.key,
            expenseId: null,
            label: l.label,
            detail: qtyDetail(l),
            amount: l.amount,
            date: null,
            paidAt: l.payment?.paidAt ?? null,
            paidAmount: l.payment?.amount ?? null,
            due: dueOf(amount, paid).toFixed(2),
            vouchers: l.vouchers,
          });
        }
        for (const e of c.expenses) {
          const amount = Number(e.amount);
          const p = sumPayments(e.payments);
          const vouchers = new Map<string, string>();
          for (const x of e.payments) vouchers.set(x.voucher.id, voucherNumber(x.voucher.seq));
          rows.push({
            rowId: `x:${e.id}`,
            kind: "extra",
            contractId: c.id,
            contractCode: c.code,
            contractStatus: c.status,
            key: null,
            expenseId: e.id,
            label: e.label,
            detail: e.note,
            amount: amount.toFixed(2),
            date: e.expenseDate.toISOString(),
            paidAt: p?.paidAt.toISOString() ?? null,
            paidAmount: p ? p.amount.toFixed(2) : null,
            due: dueOf(amount, p?.amount ?? 0).toFixed(2),
            vouchers: [...vouchers].map(([id, number]) => ({ id, number })),
          });
        }
        return rows;
      })
    );
    return perContract.flat();
  });

  // ── Bons de paiement ────────────────────────────────────────────────────
  // Un bon = un contrat, plusieurs de ses dépenses réglées d'un coup. Pas de
  // verrou de contrat : on règle souvent les dépenses d'un contrat clôturé.
  app.get<{ Querystring: { contractId?: string } }>("/payment-vouchers", async (req) => {
    const vouchers = await prisma.paymentVoucher.findMany({
      where: req.query.contractId ? { contractId: req.query.contractId } : undefined,
      orderBy: { seq: "desc" },
      include: {
        contract: { select: { code: true } },
        createdBy: { select: { name: true } },
        payments: {
          select: {
            key: true,
            amount: true,
            expense: { select: { label: true } },
            contract: { select: { id: true, code: true } },
          },
        },
      },
    });
    return vouchers.map(
      (v): PaymentVoucherDTO => ({
        id: v.id,
        number: voucherNumber(v.seq),
        contractId: v.contractId,
        contractCode: v.contract.code,
        paidAt: v.paidAt.toISOString(),
        method: v.method,
        reference: v.reference,
        note: v.note,
        total: Number(v.total).toFixed(2),
        createdBy: v.createdBy?.name ?? null,
        createdAt: v.createdAt.toISOString(),
        // Bon CREDIT : la ligne négative (contrat source) devient `creditFrom`.
        lines: v.payments
          .filter((p) => Number(p.amount) >= 0)
          .map((p) => ({
            label: p.key
              ? (COMPUTED_LABELS[p.key as ComputedExpenseDTO["key"]] ?? p.key)
              : (p.expense?.label ?? "Dépense"),
            kind: p.key ? ("computed" as const) : ("extra" as const),
            amount: Number(p.amount).toFixed(2),
          })),
        creditFrom: (() => {
          const neg = v.payments.find((p) => Number(p.amount) < 0);
          return neg ? { contractId: neg.contract.id, contractCode: neg.contract.code } : null;
        })(),
      })
    );
  });

  // Chaque ligne porte le montant réellement payé : moins que le dû (le reste
  // reste à payer, réglé par un bon suivant) ou plus (Ibrahim payé au-delà).
  app.post("/payment-vouchers", async (req, reply) => {
    const parsed = paymentVoucherCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    const contract = await prisma.contract.findUnique({
      where: { id: d.contractId },
      select: { id: true },
    });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

    const seen = new Set<string>();
    for (const i of d.items) {
      const k = "key" in i ? `c:${i.key}` : `x:${i.expenseId}`;
      if (seen.has(k)) return reply.code(400).send({ error: "Dépense en double dans le bon" });
      seen.add(k);
      if (!(Number(i.amount) > 0)) {
        return reply.code(400).send({ error: "Montant payé requis sur chaque ligne" });
      }
    }

    const expenseIds = d.items.flatMap((i) => ("expenseId" in i ? [i.expenseId] : []));
    if (expenseIds.length > 0) {
      const n = await prisma.contractExpense.count({
        where: { id: { in: expenseIds }, contractId: d.contractId },
      });
      if (n !== expenseIds.length) {
        return reply.code(400).send({ error: "Dépense introuvable sur ce contrat" });
      }
    }

    const total = d.items.reduce((s, i) => s + Number(i.amount), 0);
    const voucher = await prisma.paymentVoucher.create({
      data: {
        contractId: d.contractId,
        paidAt: d.paidAt,
        method: d.method,
        reference: d.reference || null,
        note: d.note || null,
        total: total.toFixed(2),
        createdById: req.user.sub,
        payments: {
          create: d.items.map((i) => ({
            contractId: d.contractId,
            key: "key" in i ? i.key : null,
            expenseId: "expenseId" in i ? i.expenseId : null,
            amount: i.amount,
            paidAt: d.paidAt,
          })),
        },
      },
    });
    return reply.code(201).send({ id: voucher.id, number: voucherNumber(voucher.seq) });
  });

  // Report d'un trop-payé : le compte (poste) « nous doit » sur le contrat
  // source, « on lui doit » sur la cible. Un bon CREDIT sur la cible, avec une
  // ligne négative sur la source : les deux soldes bougent, rien n'est perdu.
  app.post("/expense-transfers", async (req, reply) => {
    const parsed = expenseTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    const amount = Number(d.amount);
    if (!(amount > 0)) return reply.code(400).send({ error: "Montant requis" });

    const [from, to] = await Promise.all([
      prisma.contract.findUnique({ where: { id: d.fromContractId } }),
      prisma.contract.findUnique({ where: { id: d.toContractId }, select: { id: true } }),
    ]);
    if (!from || !to) return reply.code(404).send({ error: "Contrat introuvable" });

    const line = (await computedLines(from)).find((l) => l.key === d.key)!;
    const credit = -dueOf(Number(line.amount), Number(line.payment?.amount ?? 0));
    if (credit < amount) {
      return reply.code(409).send({
        error: `${line.label} : ${from.code} ne nous doit que ${credit.toFixed(0)} FCFA`,
      });
    }

    const voucher = await prisma.paymentVoucher.create({
      data: {
        contractId: d.toContractId,
        paidAt: d.transferredAt,
        method: "CREDIT",
        reference: null,
        note: d.note || null,
        total: amount.toFixed(2),
        createdById: req.user.sub,
        payments: {
          create: [
            {
              contractId: d.fromContractId,
              key: d.key,
              amount: (-amount).toFixed(2),
              paidAt: d.transferredAt,
            },
            { contractId: d.toContractId, key: d.key, amount: amount.toFixed(2), paidAt: d.transferredAt },
          ],
        },
      },
    });
    return reply.code(201).send({ id: voucher.id, number: voucherNumber(voucher.seq) });
  });

  // Annuler un bon : ses lignes partent en cascade, les dépenses retrouvent
  // leur reste à payer d'avant.
  app.delete<{ Params: { id: string } }>("/payment-vouchers/:id", async (req, reply) => {
    const v = await prisma.paymentVoucher.findUnique({ where: { id: req.params.id } });
    if (!v) return reply.code(404).send({ error: "Bon introuvable" });
    await prisma.paymentVoucher.delete({ where: { id: v.id } });
    return reply.code(204).send();
  });

  app.post("/contract-expenses", async (req, reply) => {
    const parsed = contractExpenseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (!(await ensureContractOpen(reply, d.contractId))) return;
    const e = await prisma.contractExpense.create({ data: d });
    return reply.code(201).send({ ...e, payment: null });
  });

  app.delete<{ Params: { id: string } }>("/contract-expenses/:id", async (req, reply) => {
    const e = await prisma.contractExpense.findUnique({
      where: { id: req.params.id },
      select: { contractId: true, _count: { select: { payments: true } } },
    });
    if (!e) return reply.code(404).send({ error: "Dépense introuvable" });
    if (e._count.payments > 0) {
      return reply
        .code(409)
        .send({ error: "Dépense payée : annuler d'abord son bon de paiement (page Dépenses)" });
    }
    if (!(await ensureContractOpen(reply, e.contractId))) return;
    await prisma.contractExpense.delete({ where: { id: req.params.id } });
    return reply.code(204).send();
  });
}
