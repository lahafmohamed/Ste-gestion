import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  billCount,
  billParent,
  billonRank,
  billonSuffix,
  nextBillId,
  nextBillonId,
} from "./index.js";

// Chronologie parc : étalage des billes (266, 267…) → nettoyage → tronçonnage
// en billons 266A/266B/266C, chacun remesuré. La bille n'est jamais remesurée.

describe("bille → billon", () => {
  it("billParent retire le suffixe lettre", () => {
    expect(billParent("266A")).toBe("266");
    expect(billParent("301G")).toBe("301");
    expect(billParent("266")).toBe("266");
    expect(billParent("  283C ")).toBe("283");
    expect(billParent(null)).toBeNull();
    expect(billParent("")).toBeNull();
  });

  it("suffixes : rang ↔ lettre (suite type colonnes Excel)", () => {
    expect(billonSuffix(1)).toBe("A");
    expect(billonSuffix(7)).toBe("G");
    expect(billonSuffix(26)).toBe("Z");
    expect(billonSuffix(27)).toBe("AA");
    expect(billonRank("A")).toBe(1);
    expect(billonRank("G")).toBe(7);
    expect(billonRank("AA")).toBe(27);
  });

  it("nextBillonId enchaîne 266A → 266B → 266C", () => {
    expect(nextBillonId("266", [])).toBe("266A");
    expect(nextBillonId("266", ["266A"])).toBe("266B");
    expect(nextBillonId("266", ["266A", "266B"])).toBe("266C");
    // n° d'une autre bille ignorés
    expect(nextBillonId("266", ["267A", "267B"])).toBe("266A");
    // reprend après le suffixe le plus haut (pas de n° réutilisé après suppression)
    expect(nextBillonId("266", ["266A", "266C"])).toBe("266D");
    // la bille peut être désignée par un de ses billons
    expect(nextBillonId("266B", ["266A", "266B"])).toBe("266C");
  });

  it("nextBillId suit la numérotation continue des billes", () => {
    expect(nextBillId("266")).toBe("267");
    expect(nextBillId("325")).toBe("326");
    expect(nextBillId("009")).toBe("010");
    expect(nextBillId("")).toBe("");
    expect(nextBillId(null)).toBe("");
  });

  it("billCount regroupe les billons par bille mère", () => {
    const logs = [
      { externalId: "266A" },
      { externalId: "266B" },
      { externalId: "266C" },
      { externalId: "267A" },
    ];
    expect(billCount(logs)).toBe(2);
    // billon sans n° : impossible à rattacher → compté seul
    expect(billCount([{ externalId: null }, { externalId: null }])).toBe(2);
  });
});

describe("oracle Excel — camion 3201 GS 01", () => {
  let data: { diameter: { bill: string }[]; girth: { numLog: string }[] } | null = null;
  try {
    const p = fileURLToPath(new URL("../../../apps/api/prisma/seed-data.json", import.meta.url));
    data = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    data = null;
  }

  it.runIf(data)("275 billons ⇒ 60 billes mères (= les 60 billes étalées)", () => {
    const logs = data!.girth.map((g) => ({ externalId: g.numLog }));
    expect(logs.length).toBe(275);
    expect(billCount(logs)).toBe(60);
    expect(data!.diameter.length).toBe(60);
  });

  it.runIf(data)("chaque billon se rattache à une bille étalée", () => {
    const bills = new Set(data!.diameter.map((d) => d.bill));
    for (const g of data!.girth) expect(bills.has(billParent(g.numLog)!)).toBe(true);
  });

  it.runIf(data)("la bille 266 a été tronçonnée en 266A…266F", () => {
    const b266 = data!.girth.filter((g) => billParent(g.numLog) === "266").map((g) => g.numLog);
    expect(b266.sort()).toEqual(["266A", "266B", "266C", "266D", "266E", "266F"]);
    expect(nextBillonId("266", b266)).toBe("266G");
  });
});
