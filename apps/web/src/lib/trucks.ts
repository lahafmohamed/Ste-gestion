import type { QueryClient } from "@tanstack/react-query";
import type { TruckDTO } from "@ste/shared";

// Chronologie réelle du parc, une page par poste de travail :
// 1. Réception (portail) — le camion arrive : immat, B/L, parcelle, origine,
//    vol brousse et nombre de billes annoncés (recopiés du bordereau SODEFOR).
// 2. Étalage (tablette au parc) — les billes sont étalées et mesurées une par
//    une (n° 266, 267…, longueur + Ø), volume auto, écarts live vs l'annoncé.
// 3. Billonnage (tablette au parc) — la bille n'est PAS remesurée : on nettoie
//    le bois puis on le tronçonne. La bille 266 donne les billons 266A, 266B,
//    266C… et c'est chaque billon qui reçoit sa mesure (longueur + girth).

/** Relevé d'étalage : les billes, mesurées au diamètre. */
export function diaOf(t: TruckDTO) {
  return t.measurements.find((m) => m.context === "YARD_DIAMETER");
}

/** Relevé de billonnage : les billons issus du tronçonnage, mesurés au girth. */
export function girthOf(t: TruckDTO) {
  return t.measurements.find((m) => m.context === "YARD_GIRTH");
}

/** En-tête recopié du bordereau — la référence que le pointage vérifie. */
export function declaredOf(t: TruckDTO) {
  return {
    count: t.declaredLogCount ?? null,
    m3: t.declaredFieldM3 != null ? Number(t.declaredFieldM3) : null,
  };
}

export type ParcStage = "A_ETALER" | "A_BILLONNER" | "TERMINE";

/** Où en est le camion dans la chaîne parc (file d'attente de l'étalage). */
export function parcStage(t: TruckDTO): ParcStage {
  if (girthOf(t)) return "TERMINE";
  if (diaOf(t)) return "A_BILLONNER";
  return "A_ETALER";
}

/**
 * Recherche libre (immat, B/L, parcelle, origine) — `needle` déjà en minuscules
 * et trimmé. Passé 40 camions, retrouver « 3201 GS 01 » au scroll n'est plus tenable.
 */
export function truckMatches(t: TruckDTO, needle: string) {
  if (needle === "") return true;
  return [t.registration, t.deliveryNote, t.parcel, t.origin]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/**
 * Un camion reçu ou un relevé enregistré bouge les camions, les stats parc, le
 * résumé, les suggestions, et les cartes de la page Contrats (brousse, camions
 * estimés — dérivées des camions).
 */
export function invalidateTrucks(qc: QueryClient, contractId: string) {
  qc.invalidateQueries({ queryKey: ["trucks", contractId] });
  qc.invalidateQueries({ queryKey: ["truck-stats", contractId] });
  qc.invalidateQueries({ queryKey: ["summary", contractId] });
  qc.invalidateQueries({ queryKey: ["suggestions", contractId] });
  qc.invalidateQueries({ queryKey: ["contracts", "overview"] });
}
