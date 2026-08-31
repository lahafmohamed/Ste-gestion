import { plateKey } from "@ste/shared";
import { prisma } from "./prisma.js";

// Référentiel des camions du parc — partagé entre /vehicles (la page Camions)
// et /trucks (la réception, qui rattache chaque voyage à son camion).

/**
 * Camion du parc correspondant à une immatriculation saisie librement, créé
 * s'il n'existe pas encore. Le parc se remplit ainsi tout seul : la première
 * réception d'un camion l'ajoute, les suivantes le retrouvent — y compris
 * écrit autrement (« 3201GS01 » retombe sur « 3201 GS 01 »).
 *
 * `null` si l'immatriculation ne porte ni lettre ni chiffre : rien à
 * référencer, le voyage garde sa chaîne telle quelle.
 */
export async function resolveVehicle(registration: string) {
  const key = plateKey(registration);
  if (key === "") return null;
  return prisma.vehicle.upsert({
    where: { plateKey: key },
    // Camion connu : sa fiche fait foi, la saisie du portail ne l'écrase pas.
    update: {},
    create: { registration: registration.trim(), plateKey: key },
  });
}
