import type { FastifyReply } from "fastify";
import { prisma } from "./prisma.js";

// Contrat clôturé = plus aucune opération métier (camions, étalages, sciage,
// ventes, conteneurs, compta). Lecture toujours libre. Repasser le contrat en
// OPEN pour corriger, puis re-clôturer.

const LOCK_MSG = "Contrat clôturé — opérations verrouillées (repasser le contrat en Ouvert pour modifier)";

/** 409 si le contrat n'est pas OPEN. Retourne true si l'opération peut continuer. */
export async function ensureContractOpen(
  reply: FastifyReply,
  contractId: string
): Promise<boolean> {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { status: true },
  });
  if (!c) {
    reply.code(404).send({ error: "Contrat introuvable" });
    return false;
  }
  if (c.status !== "OPEN") {
    reply.code(409).send({ error: LOCK_MSG });
    return false;
  }
  return true;
}

/** Variante par camion (routes étalage/packing qui ne portent que le truckId). */
export async function ensureTruckContractOpen(
  reply: FastifyReply,
  truckId: string
): Promise<boolean> {
  const t = await prisma.truck.findUnique({
    where: { id: truckId },
    select: { contract: { select: { status: true } } },
  });
  if (!t) {
    reply.code(404).send({ error: "Camion introuvable" });
    return false;
  }
  if (t.contract.status !== "OPEN") {
    reply.code(409).send({ error: LOCK_MSG });
    return false;
  }
  return true;
}
