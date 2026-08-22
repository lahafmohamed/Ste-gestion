import { describe, expect, it } from "vitest";
import {
  classifySize,
  sawnVolumeM3,
  containerPieceCount,
  containerSections,
  containerTotalM3,
  type ContainerDTO,
  type ContainerItemDTO,
} from "./index";

// Jeu réel : TC MSKU 510630/4 empoté le 17/08/2026 — 32 lignes, 282 pièces,
// 24,414 m³, 7 sections (8×6, 8×7, 8×8, 9×6, 9×7, 9×8, 9×9).
const RAW: [number, number, number, number][] = [
  [9, 8, 6, 16], [8.5, 8, 6, 28], [8, 8, 6, 15], [7, 8, 6, 36], [6, 8, 6, 2],
  [9, 8, 7, 6], [8.5, 8, 7, 7], [8, 8, 7, 15], [7, 8, 7, 15], [6, 8, 7, 1],
  [9, 8, 8, 1], [8.5, 8, 8, 3], [7, 8, 8, 7],
  [9, 9, 6, 19], [8.5, 9, 6, 13], [8, 9, 6, 15], [7, 9, 6, 26], [6.5, 9, 6, 1], [6, 9, 6, 1],
  [9, 9, 7, 6], [8.5, 9, 7, 6], [8, 9, 7, 1], [7, 9, 7, 8], [6.5, 9, 7, 1],
  [9, 9, 8, 8], [8.5, 9, 8, 3], [8, 9, 8, 6], [7, 9, 8, 9],
  [9, 9, 9, 1], [8.5, 9, 9, 1], [8, 9, 9, 3], [7, 9, 9, 2],
];

const items: ContainerItemDTO[] = RAW.map(([L, w, t, n], i) => ({
  id: `i${i}`,
  position: i + 1,
  lengthFt: String(L),
  widthIn: String(w),
  thicknessIn: String(t),
  count: n,
  sizeCode: classifySize(w, t).code,
  sizeGroup: classifySize(w, t).group,
  volumeM3: String(sawnVolumeM3(L, w, t, n)),
}));

const container = { items } as ContainerDTO;

describe("containerSections", () => {
  it("regroupe par largeur × épaisseur", () => {
    expect(containerSections(container).map((s) => s.key)).toEqual([
      "8x6", "8x7", "8x8", "9x6", "9x7", "9x8", "9x9",
    ]);
  });

  it("compte les pièces de chaque section", () => {
    const byKey = new Map(containerSections(container).map((s) => [s.key, s.count]));
    expect(byKey.get("8x6")).toBe(97);
    expect(byKey.get("8x7")).toBe(44);
    expect(byKey.get("8x8")).toBe(11);
    expect(byKey.get("9x6")).toBe(75);
    expect(byKey.get("9x7")).toBe(22);
    expect(byKey.get("9x8")).toBe(26);
    expect(byKey.get("9x9")).toBe(7);
  });

  it("trie les longueurs par ordre décroissant dans la section", () => {
    const sec = containerSections(container).find((s) => s.key === "9x6")!;
    expect(sec.items.map((i) => Number(i.lengthFt))).toEqual([9, 8.5, 8, 7, 6.5, 6]);
  });

  it("conserve les totaux du conteneur", () => {
    const secs = containerSections(container);
    expect(secs.reduce((s, x) => s + x.count, 0)).toBe(containerPieceCount(container));
    expect(secs.reduce((s, x) => s + x.volumeM3, 0)).toBeCloseTo(containerTotalM3(container), 9);
    expect(containerPieceCount(container)).toBe(282);
    expect(containerTotalM3(container)).toBeCloseTo(24.414, 3);
  });
});
