import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifySize,
  M3_TO_CFT,
  sawnLongShortM3,
  sawnThicknessBands,
  sawnVolumeM3,
  saleLineAmountCfa,
  truckCostCfa,
  volumeDiameterM3,
  volumeGirthM3,
} from "./index.js";

// Oracles = chiffres lus dans les cellules Excel (FORMULAS.md), vérifiés au chiffre.

describe("F1 — cubage diamètre (L en m, Ø en cm)", () => {
  it("log#1 : 13 × 26² × 0.00007854 = 0.69021 m³", () => {
    expect(volumeDiameterM3(13, 26)).toBeCloseTo(0.69021, 5);
  });
  it("CFT = m³ × 35.3", () => {
    expect(volumeDiameterM3(13, 26) * M3_TO_CFT).toBeCloseTo(24.3644, 3);
  });
});

describe("F2 — cubage girth (L en m, circ en cm)", () => {
  it("log#1 : 1.2 × 148² / 160000 = 0.16428 m³", () => {
    expect(volumeGirthM3(1.2, 148)).toBeCloseTo(0.16428, 5);
  });
});

describe("F3 — volume avivé (L en ft, l/ép en in)", () => {
  it("log#1 : 9 × 9 × 8 / 144 / 35.315 × 1 = 0.127425 m³", () => {
    expect(sawnVolumeM3(9, 9, 8, 1)).toBeCloseTo(0.127425, 6);
  });
  it("le count multiplie linéairement", () => {
    expect(sawnVolumeM3(9, 9, 8, 10)).toBeCloseTo(1.27425, 5);
  });
});

describe("F4 — classement des tailles", () => {
  it("ép 1 → 1\" (ONE_INCH)", () => {
    expect(classifySize(6, 1)).toEqual({ code: '1"', group: "ONE_INCH" });
  });
  it("ép 1.5 → SIDE ; ép 2 → SIDE", () => {
    expect(classifySize(4, 1.5).group).toBe("SIDE");
    expect(classifySize(4, 2).group).toBe("SIDE");
  });
  it("6x4, 6x3, 5x4, 5x3 → MAIN", () => {
    for (const [w, t] of [[6, 4], [6, 3], [5, 4], [5, 3]] as const) {
      expect(classifySize(w, t)).toEqual({ code: `${w}x${t}`, group: "MAIN" });
    }
  });
  it("4x3 → SIDE", () => {
    expect(classifySize(4, 3)).toEqual({ code: "4x3", group: "SIDE" });
  });
  it("largeur ≥ 7 → 7\"+ (MAIN)", () => {
    expect(classifySize(7, 4)).toEqual({ code: '7"+', group: "MAIN" });
  });
});

describe("Splits rapport d'activité", () => {
  const lines = [
    { lengthFt: 9, thicknessIn: 8, volumeM3: 1 }, // long, ép ≥3
    { lengthFt: 6, thicknessIn: 2, volumeM3: 1 }, // court, ép 1.5–3
    { lengthFt: 6.5, thicknessIn: 1, volumeM3: 1 }, // long (=seuil), ép <1.5
  ];
  it("LONG ≥ 6,5 ft / SHORT", () => {
    const { longM3, shortM3 } = sawnLongShortM3(lines);
    expect(longM3).toBeCloseTo(2, 6);
    expect(shortM3).toBeCloseTo(1, 6);
  });
  it("bandes d'épaisseur ≥3 / 1,5–3 / <1,5", () => {
    const b = sawnThicknessBands(lines);
    expect(b.find((x) => x.key === "gte3")!.m3).toBeCloseTo(1, 6);
    expect(b.find((x) => x.key === "b15to3")!.m3).toBeCloseTo(1, 6);
    expect(b.find((x) => x.key === "lt15")!.m3).toBeCloseTo(1, 6);
  });
});

// Oracle : Daily Truck Log (pdf7), camions 180916 / 180917 — prix du contrat
// SODEFOR 55 000, Ibrahim 24 000, transport 475 000, cubage 100 000.
describe("Coût camion (Daily Truck Log)", () => {
  const prices = {
    sodeforPrice: 55000,
    ibrahimPrice: 24000,
    transportPrice: 475000,
    cubagePrice: 100000,
  };
  it("180916 : Cost 154 385 /m³ débité, Cost MS-1.5\" 185 005 /m³ MS", () => {
    const total = truckCostCfa({ bdrM3: 21.916, diaM3: 25.119, ...prices });
    expect(total / 15.437).toBeCloseTo(154385, 0);
    expect(total / 12.882).toBeCloseTo(185005, 0);
  });
  it("180917 : Cost 158 389 /m³ débité", () => {
    const total = truckCostCfa({ bdrM3: 21.342, diaM3: 24.773, ...prices });
    expect(total / 14.795).toBeCloseTo(158389, 0);
  });
});

describe("Montant vente CFA (F9)", () => {
  it("USD × taux", () => {
    expect(saleLineAmountCfa({ volumeM3: 10, unitPriceUsd: 570, usdCfaRate: 575 })).toBe(
      10 * 570 * 575
    );
  });
  it("CFA direct prioritaire (vente 1\")", () => {
    expect(
      saleLineAmountCfa({ volumeM3: 5, unitPriceCfa: 140000, unitPriceUsd: 570, usdCfaRate: 575 })
    ).toBe(5 * 140000);
  });
});

// Régression : rejoue le dataset réel (seed-data.json) via les formules et
// vérifie les totaux Excel du camion 3201 GS 01.
describe("Agrégats du camion réel (regression seed)", () => {
  let data: {
    diameter: { length: number; dia: number }[];
    girth: { length: number; circ: number }[];
    sawn: { lengthFt: number; widthIn: number; thickIn: number; count: number }[];
  } | null = null;
  try {
    const p = fileURLToPath(new URL("../../../apps/api/prisma/seed-data.json", import.meta.url));
    data = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    data = null;
  }

  it.runIf(data)("VOL-DIA = 27.294 m³ (60 billes)", () => {
    const sum = data!.diameter.reduce((s, l) => s + volumeDiameterM3(l.length, l.dia), 0);
    expect(data!.diameter.length).toBe(60);
    expect(sum).toBeCloseTo(27.294, 2);
  });
  it.runIf(data)("VOL-G = 28.865 m³ (275 billons)", () => {
    const sum = data!.girth.reduce((s, l) => s + volumeGirthM3(l.length, l.circ), 0);
    expect(data!.girth.length).toBe(275);
    expect(sum).toBeCloseTo(28.865, 2);
  });
  it.runIf(data)("DÉBITÉ = 15.9257 m³ / 1369 pièces · rendement 55.17 %", () => {
    const sum = data!.sawn.reduce(
      (s, l) => s + sawnVolumeM3(l.lengthFt, l.widthIn, l.thickIn, l.count),
      0
    );
    const pieces = data!.sawn.reduce((s, l) => s + l.count, 0);
    const girth = data!.girth.reduce((s, l) => s + volumeGirthM3(l.length, l.circ), 0);
    expect(sum).toBeCloseTo(15.9257, 3);
    expect(pieces).toBe(1369);
    expect((sum / girth) * 100).toBeCloseTo(55.17, 1);
  });
});
