// Seed de démonstration — données réelles du camion 3201 GS 01 (BL 176530)
// extraites des classeurs Excel (voir seed-data.json, généré depuis les .xlsx racine).
// Totaux attendus (FORMULAS.md) : dia 27.294 m³ · girth 28.865 m³ · débité 15.926 m³ (1369 pcs)
// · conteneur 24.517 m³ (1101 pcs) · rendement parc 55.17 %.
// Réinitialise les données MÉTIER (contrats, camions, sciage, ventes, conteneurs, compta, tiers).
// Les utilisateurs sont conservés.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  volumeDiameterM3,
  volumeGirthM3,
  sawnVolumeM3,
  classifySize,
  M3_TO_CFT,
} from "@ste/shared";

const prisma = new PrismaClient();

type SeedData = {
  diameter: { length: number; dia: number; bill: string | null }[];
  girth: { length: number; circ: number; numLog: string | null }[];
  sawn: { lengthFt: number; widthIn: number; thickIn: number; count: number }[];
  container: { lengthFt: number; widthIn: number; thickIn: number; count: number }[];
};

const data: SeedData = JSON.parse(
  readFileSync(fileURLToPath(new URL("./seed-data.json", import.meta.url)), "utf8")
);

async function main() {
  // ── Purge métier (ordre FK ; cascade gère les enfants) ──────────────
  await prisma.container.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.productionRun.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.accountEntry.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.party.deleteMany();

  // ── Tiers ───────────────────────────────────────────────────────────
  const sodefor = await prisma.party.create({
    data: { name: "SODEFOR", type: "SUPPLIER" },
  });
  const ibrahim = await prisma.party.create({
    data: { name: "IBRAHIM", type: "INTERNAL" },
  });
  const jamal = await prisma.party.create({
    data: { name: "JAMAL", type: "TRANSPORTER" },
  });

  // ── Contrat de pilotage A3-2026-029 (termes du dashboard Excel) ─────
  await prisma.contract.create({
    data: {
      code: "A3-2026-029",
      year: 2026,
      status: "OPEN",
      note: "Contrat de pilotage — termes repris du classeur EMPOTAGES DEBITES.",
      quotaM3: "1000",
      trucksPlanned: 47,
      sodeforPrice: "55000",
      ibrahimPrice: "24000",
      transportPrice: "475000",
      cubagePrice: "100000",
      companyPrice: "90000",
      exportPrice: "65000",
      sellingPriceUsd: "570",
      usdCfaRate: "575",
      oneInchPrice: "140000",
      feeSodeforR: "42500000",
      feeSodeforPlus: "7500000",
      feeReforestation: "2500000",
      woodBudget: "33812722",
      companyBudget: "12717450",
      exportBudget: "9184825",
      sodeforPartyId: sodefor.id,
      cubagePartyId: ibrahim.id,
      transportPartyId: jamal.id,
    },
  });

  // ── Contrat A3-2026-014 — celui du camion réel suivi de bout en bout ─
  const c014 = await prisma.contract.create({
    data: {
      code: "A3-2026-014",
      year: 2026,
      status: "OPEN",
      note:
        "Camion réel des classeurs (3201 GS 01, BL 176530). " +
        "Quota 1000 m³ = valeur de démonstration (quota réel non documenté). " +
        "Forêt SANGOUÉ · centre GAGNOA · signé 03/02/2026 · 11 mois.",
      quotaM3: "1000",
      sodeforPartyId: sodefor.id,
      cubagePartyId: ibrahim.id,
      transportPartyId: jamal.id,
    },
  });

  // ── Camion 3201 GS 01 (bordereau SODEFOR 176530) ────────────────────
  const truck = await prisma.truck.create({
    data: {
      contractId: c014.id,
      registration: "3201 GS 01",
      deliveryNote: "176530",
      parcel: "146-99/04",
      origin: "SANGOUE",
      // Bordereau SODEFOR réel (pdf2.pdf « circulation des bois »)
      transporter: "JAMAL",
      driver: "KONATE MADOU",
      trailer: "7794 F3 01",
      bookletNo: "6455",
      bonNo: "225640693814",
      smsCode: "47734027",
      followupAgent: "Sgt Koffi Joel",
      destination: "TOUMODI",
      loadedAt: new Date("2026-05-11T15:00:00Z"),
      declaredFieldM3: "33.171", // cubage brousse du bordereau
      declaredLogCount: 58, // billes bordereau (60 constatées sur parc → écart +2)
      arrivedAt: new Date("2026-05-12T08:00:00Z"),
    },
  });

  // ── Étalage DIAMÈTRE (60 billes, F1) ────────────────────────────────
  const mDia = await prisma.logMeasurement.create({
    data: {
      truckId: truck.id,
      context: "YARD_DIAMETER",
      measuredAt: new Date("2026-05-12T10:00:00Z"),
    },
  });
  await prisma.log.createMany({
    data: data.diameter.map((l, i) => {
      const vol = volumeDiameterM3(l.length, l.dia);
      return {
        measurementId: mDia.id,
        position: i + 1,
        externalId: l.bill,
        lengthFt: l.length.toString(),
        diameterIn: l.dia.toString(),
        volumeM3: vol.toFixed(6),
        cft: (vol * M3_TO_CFT).toFixed(4),
      };
    }),
  });

  // ── Étalage GIRTH (275 billons, F2 — référence rendement/quota) ─────
  const mGirth = await prisma.logMeasurement.create({
    data: {
      truckId: truck.id,
      context: "YARD_GIRTH",
      measuredAt: new Date("2026-05-12T14:00:00Z"),
    },
  });
  await prisma.log.createMany({
    data: data.girth.map((l, i) => ({
      measurementId: mGirth.id,
      position: i + 1,
      externalId: l.numLog,
      lengthM: l.length.toString(),
      circumferenceCm: l.circ.toString(),
      volumeM3: volumeGirthM3(l.length, l.circ).toFixed(6),
    })),
  });

  // ── Débitage du 15-05-2026 (227 lignes, F3/F4) ──────────────────────
  const run = await prisma.productionRun.create({
    data: {
      contractId: c014.id,
      producedAt: new Date("2026-05-15T00:00:00Z"),
      note: "DEBITE TECK DU 15-05-2026 (tableau de stock Excel)",
      trucks: { create: [{ truckId: truck.id }] },
    },
  });
  await prisma.sawnLine.createMany({
    data: data.sawn.map((l, i) => {
      const { code, group } = classifySize(l.widthIn, l.thickIn);
      return {
        runId: run.id,
        position: i + 1,
        lengthFt: l.lengthFt.toString(),
        widthIn: l.widthIn.toString(),
        thicknessIn: l.thickIn.toString(),
        count: l.count,
        sizeCode: code,
        sizeGroup: group,
        volumeM3: sawnVolumeM3(l.lengthFt, l.widthIn, l.thickIn, l.count).toFixed(6),
      };
    }),
  });

  // ── Empotage conteneur MRKU 684202-0 (08-05-2026) ───────────────────
  await prisma.container.create({
    data: {
      contractId: c014.id,
      containerNo: "MRKU 684202-0",
      sealNo: "ML-CI 1238871",
      fauxSealNo: "STE 0523",
      bookingNo: "270377830",
      grade: "5X3 B GRADE",
      destination: "MANGALORE",
      status: "LOADED",
      loadedAt: new Date("2026-05-08T00:00:00Z"),
      items: {
        create: data.container.map((l, i) => {
          const { code, group } = classifySize(l.widthIn, l.thickIn);
          return {
            position: i + 1,
            lengthFt: l.lengthFt.toString(),
            widthIn: l.widthIn.toString(),
            thicknessIn: l.thickIn.toString(),
            count: l.count,
            sizeCode: code,
            sizeGroup: group,
            volumeM3: sawnVolumeM3(l.lengthFt, l.widthIn, l.thickIn, l.count).toFixed(6),
          };
        }),
      },
    },
  });

  // ── Contrôles ───────────────────────────────────────────────────────
  const [diaSum, girthSum, sawnSum] = await Promise.all([
    prisma.log.aggregate({ where: { measurementId: mDia.id }, _sum: { volumeM3: true } }),
    prisma.log.aggregate({ where: { measurementId: mGirth.id }, _sum: { volumeM3: true } }),
    prisma.sawnLine.aggregate({ where: { runId: run.id }, _sum: { volumeM3: true, count: true } }),
  ]);
  console.log("Seed OK —");
  console.log("  VOL-DIA  :", diaSum._sum.volumeM3?.toString(), "(attendu ≈27.294)");
  console.log("  VOL-G    :", girthSum._sum.volumeM3?.toString(), "(attendu ≈28.865)");
  console.log(
    "  DÉBITÉ   :",
    sawnSum._sum.volumeM3?.toString(),
    `/ ${sawnSum._sum.count} pcs (attendu ≈15.926 / 1369)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
