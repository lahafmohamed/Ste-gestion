import { describe, expect, it } from "vitest";
import { qualityFromLabel, suiviColumnKey, suiviVisibleColumns } from "./stock.js";

describe("qualityFromLabel", () => {
  it.each([
    ["A GRADE", "A"],
    ["a grade", "A"],
    ["A", "A"],
    ["6X3 A GRADE", "A"],
    ["5X3 C", "C"],
    ["5X3C", "C"],
    ["5X3 C GRADE", "C"],
    ["C", "C"],
    ["5X3 B GRADE", "B"],
    ["6X3 B", "B"],
    ["MAIN SIZES", "B"],
    ["SIDE SIZES", "B"],
    ["8'' +", "B"],
    ["1''", "B"],
    ["", "B"],
    [null, "B"],
  ] as const)("%s → %s", (label, q) => {
    expect(qualityFromLabel(label)).toBe(q);
  });
});

describe("suiviColumnKey", () => {
  it("range les pièces dans les colonnes du classeur SUIVI", () => {
    expect(suiviColumnKey(11, 8, "B")).toBe("8plus");
    expect(suiviColumnKey(8, 1.5, "B")).toBe("8plus"); // largeur ≥ 8 prime
    expect(suiviColumnKey(7, 5, "B")).toBe("6to7");
    expect(suiviColumnKey(6, 4, "B")).toBe("6x4B");
    expect(suiviColumnKey(6, 3, "B")).toBe("6x3B");
    expect(suiviColumnKey(5, 3, "C")).toBe("5x3C");
    expect(suiviColumnKey(6, 3, "A")).toBe("A");
    expect(suiviColumnKey(4, 3, "B")).toBe("4x3");
    expect(suiviColumnKey(4, 3, "C")).toBe("4x3"); // pas de C en side sizes
    expect(suiviColumnKey(4, 2, "B")).toBe("2in");
    expect(suiviColumnKey(3, 1.5, "B")).toBe("1.5in");
    expect(suiviColumnKey(9.5, 1, "B")).toBe("1in");
    expect(suiviColumnKey(3, 3, "B")).toBe("other");
  });

  it("n'affiche les colonnes hors classeur que si elles servent", () => {
    expect(suiviVisibleColumns([]).length).toBe(12);
    const cols = suiviVisibleColumns(["6x3C", "8plus"]).map((c) => c.key);
    expect(cols).toContain("6x3C");
    expect(cols).not.toContain("other");
  });
});
