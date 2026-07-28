const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const nfInt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function fmtM3(v: string | number): string {
  return `${nf.format(Number(v))} m³`;
}

export function fmtFcfa(v: string | number): string {
  return `${nfInt.format(Number(v))} FCFA`;
}

export function fmtInt(v: string | number): string {
  return nfInt.format(Number(v));
}

export function fmtNum(v: string | number): string {
  return nf.format(Number(v));
}

export function fmtPct(v: number, digits = 1): string {
  return `${v.toFixed(digits)} %`;
}

/**
 * Saisie décimale FR → format machine : « 33,171 » → « 33.171 ».
 * Les claviers du parc (et l'habitude) donnent la virgule, alors que Number()
 * et l'API attendent le point — sans ça le volume live reste à « — » et
 * l'enregistrement part en erreur de validation.
 * À appeler dans onChange, pour que la correction soit visible pendant la frappe.
 */
export function normalizeDecimal(v: string): string {
  return v.replace(/,/g, ".");
}

/** % utilisé du quota, borné [0,100+], -1 si quota 0. */
export function usedPct(used: string | number, quota: string | number): number {
  const q = Number(quota);
  if (q <= 0) return -1;
  return (Number(used) / q) * 100;
}
