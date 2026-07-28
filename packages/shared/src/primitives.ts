// Primitives de validation Zod partagées (montants, volumes, compteurs).
import { z } from "zod";

// Montants / volumes transitent en string (précision décimale exacte).
export const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Nombre décimal invalide");

export const signedDecimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Nombre décimal invalide");

export const count = z.coerce.number().int().min(0);
