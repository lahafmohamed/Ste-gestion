// Modules mis en veille — le code, les routes API et les données restent en
// place, seule l'entrée dans l'UI disparaît. Repasser un flag à `true` remet le
// module en ligne sans autre changement.
//
// Coupés le 2026-08-19 : le terrain (réception → étalage → débitage → stock →
// empotage) tourne, le volet commercial/finance n'est pas prêt.
export const FEATURES = {
  /** Ventes : page /ventes, onglet « Ventes » de la fiche contrat. */
  sales: false,
  /** Comptabilité : page /compta, onglet « Comptabilité », KPI financiers. */
  accounting: false,
  /** Rapport : page /rapport (synthèse imprimable). */
  report: false,
} as const;

/** Les KPI argent (CA, payé, solde, profit) ne tiennent que si ventes ET compta sont actives. */
export const SHOW_MONEY = FEATURES.sales && FEATURES.accounting;
