import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { contractExpenseCreateSchema, type ComputedExpenseDTO } from "@ste/shared";
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
//   Transport × camions entrés          Cubage × camions entrés
//   1"        × m³ de 1" débité
//   Frais SODEFOR (R, +, reboisement) : forfaits fixes du contrat.
// Company / Export retirés des paramètres de prix (2026-10-21) : plus de ligne.

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

export async function expenseRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/contracts/:id/expenses", async (req, reply) => {
    const contractId = req.params.id;
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) return reply.code(404).send({ error: "Contrat introuvable" });

    const [q, extra] = await Promise.all([
      contractQuantities(contractId),
      prisma.contractExpense.findMany({
        where: { contractId },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const computed: ComputedExpenseDTO[] = [];
    const line = (
      key: ComputedExpenseDTO["key"],
      label: string,
      quantity: number | null,
      unit: string | null,
      unitPrice: Prisma.Decimal
    ) => {
      const price = Number(unitPrice);
      const amount = quantity === null ? price : quantity * price;
      computed.push({
        key,
        label,
        quantity: quantity === null ? null : quantity.toFixed(6),
        unit,
        unitPrice: price.toFixed(2),
        amount: amount.toFixed(2),
        priced: price > 0,
      });
    };

    line("SODEFOR", "SODEFOR", q.brousseM3, "m³ brousse", contract.sodeforPrice);
    line("IBRAHIM", "Ibrahim (cubage)", q.diaM3, "m³ étalé Ø", contract.ibrahimPrice);
    line("TRANSPORT", "Transport", q.trucksEntered, "camions", contract.transportPrice);
    line("CUBAGE", "Cubage", q.trucksEntered, "camions", contract.cubagePrice);
    line("ONE_INCH", "1\"", q.oneInchM3, "m³ de 1\"", contract.oneInchPrice);
    line("FEE_SODEFOR_R", "SODEFOR & R", null, null, contract.feeSodeforR);
    line("FEE_SODEFOR_PLUS", "SODEFOR +", null, null, contract.feeSodeforPlus);
    line("FEE_REFORESTATION", "Reboisement", null, null, contract.feeReforestation);

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

  app.post("/contract-expenses", async (req, reply) => {
    const parsed = contractExpenseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (!(await ensureContractOpen(reply, d.contractId))) return;
    const e = await prisma.contractExpense.create({ data: d });
    return reply.code(201).send(e);
  });

  app.delete<{ Params: { id: string } }>("/contract-expenses/:id", async (req, reply) => {
    const e = await prisma.contractExpense.findUnique({
      where: { id: req.params.id },
      select: { contractId: true },
    });
    if (!e) return reply.code(404).send({ error: "Dépense introuvable" });
    if (!(await ensureContractOpen(reply, e.contractId))) return;
    await prisma.contractExpense.delete({ where: { id: req.params.id } });
    return reply.code(204).send();
  });
}
