// Classement des tailles d'avivés (F4 — règle inférée du dashboard, ajustable).
import { z } from "zod";

export const SizeGroup = z.enum(["MAIN", "SIDE", "ONE_INCH", "OTHER"]);
export type SizeGroup = z.infer<typeof SizeGroup>;

export const SIZE_GROUP_LABELS: Record<SizeGroup, string> = {
  MAIN: "Main sizes",
  SIDE: "Side sizes",
  ONE_INCH: '1"',
  OTHER: "Autre",
};

/**
 * F4 — classement d'un avivé (l × ép, pouces) :
 * ép 1 → 1" ; ép 1.5 / 2 → side ; couples connus → main/side ; l ≥ 7 → 7"+.
 */
export function classifySize(
  widthIn: number,
  thicknessIn: number
): { code: string; group: SizeGroup } {
  if (thicknessIn === 1) return { code: '1"', group: "ONE_INCH" };
  if (thicknessIn === 1.5) return { code: '1.5"', group: "SIDE" };
  if (thicknessIn === 2) return { code: '2"', group: "SIDE" };
  const key = `${widthIn}x${thicknessIn}`;
  if (key === "4x3") return { code: "4x3", group: "SIDE" };
  if (["6x4", "6x3", "5x4", "5x3"].includes(key)) return { code: key, group: "MAIN" };
  if (widthIn >= 7) return { code: '7"+', group: "MAIN" };
  return { code: "AUTRE", group: "OTHER" };
}

// Ordre d'affichage des tailles (colonnes CONTRACTS CUTTING de l'Excel).
export const SIZE_ORDER = ['7"+', "6x4", "6x3", "5x4", "5x3", "4x3", '2"', '1.5"', '1"'] as const;

export function sizeSortIndex(code: string): number {
  const i = (SIZE_ORDER as readonly string[]).indexOf(code);
  return i === -1 ? SIZE_ORDER.length : i;
}
