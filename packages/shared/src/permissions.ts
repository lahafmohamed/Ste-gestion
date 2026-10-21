// Catalogue des permissions — une par action métier, groupées par module
// (= page de l'app). Clé `module.action`. L'API et l'interface partagent ce
// fichier : l'API s'en sert pour filtrer les routes, l'interface pour masquer
// navigation et boutons.
//
// ADMIN a tout, toujours (non modifiable). Les autres rôles portent une liste
// éditable en base (matrice), chaque utilisateur peut recevoir des ajouts ou
// retraits par rapport à son rôle.

export type PermissionAction = "view" | "create" | "edit" | "delete" | "export";

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Voir",
  create: "Saisir",
  edit: "Modifier",
  delete: "Supprimer",
  export: "Exporter Excel",
};

export type PermissionModule = {
  key: string;
  label: string;
  /** Ce que couvre le module, pour l'écran d'administration. */
  hint: string;
  actions: readonly PermissionAction[];
  /** Libellés spécifiques quand « Saisir / Modifier » ne suffit pas. */
  actionLabels?: Partial<Record<PermissionAction, string>>;
};

export const PERMISSION_MODULES: readonly PermissionModule[] = [
  {
    key: "contracts",
    label: "Contrats",
    hint: "Fiche contrat, termes (n°, quota, administratif), clôture, suppression en cascade, export Excel. Les prix relèvent du module Finances.",
    actions: ["view", "create", "edit", "delete", "export"],
    actionLabels: { edit: "Modifier / clôturer", export: "Exporter Excel (contrat, camion)" },
  },
  {
    key: "reception",
    label: "Réception",
    hint: "Bordereau SODEFOR du camion au portail, packing list grumes.",
    actions: ["view", "create", "edit", "delete"],
    actionLabels: {
      create: "Réceptionner un camion",
      edit: "Modifier bordereau / packing",
      delete: "Supprimer un camion",
    },
  },
  {
    key: "etalage",
    label: "Étalage",
    hint: "Relevés au parc : étalage des billes et billonnage.",
    actions: ["view", "create", "edit", "delete"],
    actionLabels: {
      create: "Saisir un relevé",
      edit: "Corriger une ligne / écart",
      delete: "Supprimer ligne ou relevé",
    },
  },
  {
    key: "debitage",
    label: "Débitage",
    hint: "Sessions de sciage (billons → avivés).",
    actions: ["view", "create", "delete"],
    actionLabels: { create: "Saisir une session", delete: "Supprimer une session" },
  },
  {
    key: "stock",
    label: "Stock",
    hint: "Inventaire des avivés et resciages.",
    actions: ["view", "create", "delete"],
    actionLabels: { create: "Saisir un resciage", delete: "Supprimer un resciage" },
  },
  {
    key: "empotage",
    label: "Empotage",
    hint: "Conteneurs d'export, lignes d'avivés, statut et plomb.",
    actions: ["view", "create", "edit", "delete"],
    actionLabels: {
      create: "Créer conteneur / ajouter lignes",
      edit: "Statut, camions, plomb",
      delete: "Supprimer conteneur / ligne",
    },
  },
  {
    key: "ventes",
    label: "Ventes",
    hint: "Ventes d'avivés (module en veille tant que le flag est coupé).",
    actions: ["view", "create", "delete"],
  },
  {
    key: "compta",
    label: "Comptabilité",
    hint: "Tiers, dûs et paiements par contrat (module en veille).",
    actions: ["view", "create", "delete"],
    actionLabels: { create: "Ajouter tiers / écriture", delete: "Supprimer une écriture" },
  },
  {
    key: "finances",
    label: "Finances",
    hint: "Ce que le contrat coûte et rapporte : paramètres de prix, frais et budgets des termes, onglet Dépenses, chiffre d'affaires et profit. Sans « Voir », l'API masque ces chiffres partout (fiche, résumé, export).",
    actions: ["view", "edit"],
    actionLabels: {
      view: "Voir prix, dépenses, CA et profit",
      edit: "Modifier les prix, ajouter / supprimer une dépense",
    },
  },
  {
    key: "camions",
    label: "Camions",
    hint: "Référentiel du parc de camions (immatriculation, transporteur, chauffeur).",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "rapport",
    label: "Rapport",
    hint: "Synthèse journalière imprimable (module en veille).",
    actions: ["view"],
  },
] as const;

/** `users.manage` : gestion des comptes et des permissions — ADMIN seul, jamais délégué. */
export const ADMIN_ONLY_PERMISSION = "users.manage";

export type Permission = `${string}.${PermissionAction}` | typeof ADMIN_ONLY_PERMISSION;

/** Toutes les permissions déléguables (hors `users.manage`). */
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_MODULES.flatMap((m) =>
  m.actions.map((a) => `${m.key}.${a}` as Permission),
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);
export function isPermission(p: string): p is Permission {
  return PERMISSION_SET.has(p);
}

export function permissionLabel(p: string): string {
  const [mod, act] = p.split(".");
  const m = PERMISSION_MODULES.find((x) => x.key === mod);
  if (!m) return p;
  const a = act as PermissionAction;
  return `${m.label} — ${m.actionLabels?.[a] ?? PERMISSION_ACTION_LABELS[a] ?? act}`;
}

function mod(key: string, ...actions: PermissionAction[]): Permission[] {
  return actions.map((a) => `${key}.${a}` as Permission);
}
function full(key: string): Permission[] {
  const m = PERMISSION_MODULES.find((x) => x.key === key)!;
  return mod(key, ...m.actions);
}

/**
 * Matrice par défaut (PLAN §7) — semée en base à la migration, rétablissable
 * depuis l'écran d'administration. ADMIN n'y figure pas : il a tout.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Exclude<"ADMIN" | "BUREAU" | "PARC" | "SCIERIE" | "EXPORT", "ADMIN">,
  readonly Permission[]
> = {
  BUREAU: [
    ...full("contracts"),
    ...mod("reception", "view"),
    ...mod("etalage", "view"),
    ...mod("debitage", "view"),
    ...mod("stock", "view"),
    ...mod("empotage", "view"),
    ...mod("ventes", "view"),
    ...full("compta"),
    ...full("finances"),
    ...full("camions"),
    ...full("rapport"),
  ],
  PARC: [
    ...mod("contracts", "view"),
    ...full("reception"),
    ...full("etalage"),
    ...mod("debitage", "view"),
    ...mod("stock", "view"),
    ...full("empotage"),
    ...full("camions"),
  ],
  SCIERIE: [
    ...mod("contracts", "view"),
    ...mod("reception", "view"),
    ...mod("etalage", "view"),
    ...full("debitage"),
    ...full("stock"),
  ],
  EXPORT: [
    ...mod("contracts", "view", "export"),
    ...mod("stock", "view"),
    ...full("ventes"),
    ...full("empotage"),
    ...mod("compta", "view"),
    ...full("rapport"),
  ],
};

/** Permissions effectives : rôle ∪ ajouts − retraits ; ADMIN = tout. */
export function effectivePermissions(
  role: string,
  rolePermissions: readonly string[],
  granted: readonly string[] = [],
  revoked: readonly string[] = [],
): Permission[] {
  if (role === "ADMIN") return [...ALL_PERMISSIONS, ADMIN_ONLY_PERMISSION];
  const set = new Set<string>(rolePermissions);
  for (const p of granted) set.add(p);
  for (const p of revoked) set.delete(p);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/**
 * Champs du contrat réservés à `finances.view` : l'API les renvoie à `null`
 * aux comptes qui ne l'ont pas (un compte de saisie voit le n°, le quota et
 * l'administratif, jamais les prix ni ce que rapporte le contrat), et refuse
 * de les modifier sans `finances.edit`.
 */
export const FINANCE_CONTRACT_FIELDS = [
  "sodeforPrice",
  "ibrahimPrice",
  "transportPrice",
  "cubagePrice",
  "companyPrice",
  "exportPrice",
  "sellingPriceUsd",
  "usdCfaRate",
  "oneInchPrice",
  "feeSodeforR",
  "feeSodeforPlus",
  "feeReforestation",
  "woodBudget",
  "companyBudget",
  "exportBudget",
  "expectedProfit",
  "sodeforPartyId",
  "cubagePartyId",
  "transportPartyId",
] as const;

/** Champs argent du résumé / de la vue liste, masqués de la même façon. */
export const FINANCE_SUMMARY_FIELDS = [
  "salesRevenueCfa",
  "fullCost",
  "totalPaid",
  "balance",
  "profitEstimate",
] as const;
