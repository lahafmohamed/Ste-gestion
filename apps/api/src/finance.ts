import type { FastifyRequest } from "fastify";
import { FINANCE_CONTRACT_FIELDS, FINANCE_SUMMARY_FIELDS } from "@ste/shared";
import { userHas } from "./permissions.js";

// ── Masquage des chiffres d'argent ──────────────────────────────────────
// Un compte de saisie (parc, scierie) lit la fiche contrat pour travailler :
// n°, quota, parcelle. Il ne doit pas voir les prix, les frais, ce que le
// contrat coûte ni ce qu'il rapporte. Plutôt que de refuser la route, l'API
// renvoie les champs concernés à `null` ; l'interface n'affiche de toute façon
// pas ces cartes sans `finances.view`.

export function canSeeFinance(req: FastifyRequest): Promise<boolean> {
  return userHas(req.user.sub, "finances.view");
}

export function canEditFinance(req: FastifyRequest): Promise<boolean> {
  return userHas(req.user.sub, "finances.edit");
}

function blank<T extends object>(obj: T, keys: readonly string[]): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of keys) if (k in out) out[k] = null;
  return out as T;
}

/** Contrat sans ses prix, frais, budgets et tiers assignés. */
export function redactContract<T extends object>(c: T): T {
  return blank(c, FINANCE_CONTRACT_FIELDS);
}

/** Résumé / vue liste sans CA, coût, solde ni profit. */
export function redactSummary<T extends object>(s: T): T {
  return blank(s, FINANCE_SUMMARY_FIELDS);
}

/** Vrai si la charge utile touche un champ financier du contrat. */
export function touchesFinance(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return FINANCE_CONTRACT_FIELDS.some((k) => k in (body as object));
}

export const FINANCE_EDIT_MSG =
  "Les prix, frais et budgets du contrat relèvent de la permission « Finances — Modifier »";
