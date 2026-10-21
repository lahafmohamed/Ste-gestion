// Shared types & Zod schemas (front + back). Barrel : calculs, constantes et
// primitives vivent dans des modules dédiés ; ce fichier porte les schémas/DTOs.

import { z } from "zod";
import { decimalString, signedDecimalString, count } from "./primitives.js";
import { SizeGroup } from "./sizes.js";
import { isPermission, type Permission } from "./permissions.js";

// Modules leaf réexportés (API publique inchangée).
export * from "./primitives.js";
export * from "./formulas.js";
export * from "./sizes.js";
export * from "./permissions.js";
export * from "./imports.js";

export const APP_NAME = "Ste-gestion";

export const ContractStatus = z.enum(["OPEN", "CLOSED"]);
export type ContractStatus = z.infer<typeof ContractStatus>;

// ── Auth / utilisateurs ────────────────────────────────────────────────

export const UserRole = z.enum(["ADMIN", "BUREAU", "PARC", "SCIERIE", "EXPORT"]);
export type UserRole = z.infer<typeof UserRole>;

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  BUREAU: "Bureau",
  PARC: "Parc",
  SCIERIE: "Scierie",
  EXPORT: "Export",
};

const emailLike = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Email invalide")
  .regex(/^[^\s@]+@[^\s@]+$/, "Email invalide");

export const loginSchema = z.object({
  email: emailLike,
  password: z.string().min(1, "Mot de passe requis"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  email: emailLike,
  password: z.string().min(6, "6 caractères minimum"),
  role: UserRole,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

const permissionList = z
  .array(z.string().refine(isPermission, "Permission inconnue"))
  .max(200)
  .transform((l) => Array.from(new Set(l)) as Permission[]);

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: UserRole.optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  /** Surcharges par rapport au rôle (ADMIN : ignorées, il a tout). */
  permissionsGranted: permissionList.optional(),
  permissionsRevoked: permissionList.optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  /** Surcharges individuelles (vides par défaut). */
  permissionsGranted: Permission[];
  permissionsRevoked: Permission[];
  /** Permissions effectives (rôle ∪ ajouts − retraits) — ce que l'UI consulte. */
  permissions: Permission[];
};

/** Matrice rôle → permissions (hors ADMIN), telle qu'en base. */
export type RolePermissionsDTO = Record<Exclude<UserRole, "ADMIN">, Permission[]>;

export const rolePermissionsUpdateSchema = z.object({
  permissions: permissionList,
});
export type RolePermissionsUpdateInput = z.infer<typeof rolePermissionsUpdateSchema>;

export type LoginResponse = { token: string; user: UserDTO };

export const contractCreateSchema = z.object({
  code: z.string().trim().min(1, "Code requis").max(50),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: ContractStatus.optional(),
  // Vidée depuis la carte Termes → null (comme l'administratif).
  note: z.string().trim().max(500).nullable().optional(),

  // Termes du contrat
  quotaM3: decimalString,
  trucksPlanned: count.optional(),

  // Administratif (bordereau SODEFOR — saisie progressive, tout optionnel)
  signedAt: z.coerce.date().nullable().optional(),
  durationMonths: count.nullable().optional(),
  exploitationStartAt: z.coerce.date().nullable().optional(),
  forest: z.string().trim().max(100).nullable().optional(),
  managementCenter: z.string().trim().max(100).nullable().optional(),
  // Provenance du bois — recopiée sur chaque camion à la réception.
  parcel: z.string().trim().max(50).nullable().optional(),
  origin: z.string().trim().max(100).nullable().optional(),

  // Paramètres de prix
  sodeforPrice: decimalString.optional(),
  ibrahimPrice: decimalString.optional(),
  transportPrice: decimalString.optional(),
  cubagePrice: decimalString.optional(),
  companyPrice: decimalString.optional(),
  exportPrice: decimalString.optional(),
  sellingPriceUsd: decimalString.optional(),
  usdCfaRate: decimalString.optional(),
  oneInchPrice: decimalString.optional(),

  // Frais SODEFOR fixes
  feeSodeforR: decimalString.optional(),
  feeSodeforPlus: decimalString.optional(),
  feeReforestation: decimalString.optional(),

  // Budgets
  woodBudget: decimalString.optional(),
  companyBudget: decimalString.optional(),
  exportBudget: decimalString.optional(),
  expectedProfit: signedDecimalString.optional(),

  // Tiers assignés (activent les suggestions de dûs)
  sodeforPartyId: z.string().min(1).nullable().optional(),
  cubagePartyId: z.string().min(1).nullable().optional(),
  transportPartyId: z.string().min(1).nullable().optional(),
});
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = contractCreateSchema.partial();
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

// Forme renvoyée par l'API (Decimal sérialisé en string).
export type ContractDTO = {
  id: string;
  code: string;
  year: number | null;
  status: ContractStatus;
  note: string | null;

  quotaM3: string;
  trucksPlanned: number;

  signedAt: string | null;
  durationMonths: number | null;
  exploitationStartAt: string | null;
  forest: string | null;
  managementCenter: string | null;
  parcel: string | null;
  origin: string | null;

  sodeforPrice: string;
  ibrahimPrice: string;
  transportPrice: string;
  cubagePrice: string;
  companyPrice: string;
  exportPrice: string;
  sellingPriceUsd: string;
  usdCfaRate: string;
  oneInchPrice: string;

  feeSodeforR: string;
  feeSodeforPlus: string;
  feeReforestation: string;

  woodBudget: string;
  companyBudget: string;
  exportBudget: string;
  expectedProfit: string | null;

  sodeforPartyId: string | null;
  cubagePartyId: string | null;
  transportPartyId: string | null;

  createdAt: string;
  updatedAt: string;
};

// ── Production / débitage ─────────────────────────────────────────────

const sawnLineInput = z.object({
  lengthFt: decimalString,
  widthIn: decimalString,
  thicknessIn: decimalString,
  count: z.coerce.number().int().min(1),
});

export const productionRunCreateSchema = z.object({
  // Pas de contractId : le débité tombe dans le stock général. Le serveur
  // recopie le contrat des camions sciés (null si plusieurs contrats).
  producedAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
  truckIds: z.array(z.string().min(1)).optional(),
  // Billes (billons girth) sciées — granularité fine ; vide = camion entier.
  logIds: z.array(z.string().min(1)).optional(),
  lines: z.array(sawnLineInput).min(1),
});
export type ProductionRunCreateInput = z.infer<typeof productionRunCreateSchema>;

export type SawnLineDTO = {
  id: string;
  position: number;
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  count: number;
  sizeCode: string;
  sizeGroup: SizeGroup;
  volumeM3: string;
};

export type ProductionRunDTO = {
  id: string;
  /** Déduit des camions sciés — null si session sans camion ou multi-contrats. */
  contractId: string | null;
  producedAt: string;
  note: string | null;
  createdAt: string;
  truckIds: string[];
  logIds: string[]; // billes girth sciées (vide = camion entier)
  lines: SawnLineDTO[];
};

export function runTotalM3(r: ProductionRunDTO): number {
  return r.lines.reduce((s, l) => s + Number(l.volumeM3), 0);
}

export function runPieceCount(r: ProductionRunDTO): number {
  return r.lines.reduce((s, l) => s + l.count, 0);
}

export function runGroupTotals(r: ProductionRunDTO): Record<SizeGroup, number> {
  const t: Record<SizeGroup, number> = { MAIN: 0, SIDE: 0, ONE_INCH: 0, OTHER: 0 };
  for (const l of r.lines) t[l.sizeGroup] += Number(l.volumeM3);
  return t;
}

// ── Resciage ──────────────────────────────────────────────────────────
// Bois déjà scié en stock repassé à la scie en sections plus petites.
// Les deux sens (consommé / produit) partagent la forme d'une ligne débitée.

export const resawOpCreateSchema = z.object({
  // Stock → stock : pas de contrat.
  resawnAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
  consumed: z.array(sawnLineInput).min(1), // pris dans le stock
  produced: z.array(sawnLineInput).min(1), // remis au stock (plus petit)
});
export type ResawOpCreateInput = z.infer<typeof resawOpCreateSchema>;

export type ResawOpDTO = {
  id: string;
  contractId: string | null;
  resawnAt: string;
  note: string | null;
  createdAt: string;
  consumed: SawnLineDTO[];
  produced: SawnLineDTO[];
};

// Agrégat débité par taille sur tout le contrat (bloc CONTRACTS CUTTING).
export type CuttingSizeDTO = {
  code: string;
  group: SizeGroup;
  volumeM3: string;
  pieces: number;
};

export type ContractCuttingDTO = {
  sizes: CuttingSizeDTO[];
  groups: Record<SizeGroup, string>; // m³ par groupe
  totalM3: string;
  totalPieces: number;
};

// ── Réception : camions & étalage ─────────────────────────────────────

export const MeasurementContext = z.enum(["FIELD", "YARD_GIRTH", "YARD_DIAMETER"]);
export type MeasurementContext = z.infer<typeof MeasurementContext>;

export const MEASUREMENT_CONTEXT_LABELS: Record<MeasurementContext, string> = {
  FIELD: "Cubage brousse",
  YARD_GIRTH: "Cubage billons (girth)",
  YARD_DIAMETER: "Cubage billes (diamètre)",
};

// ── Camions du parc (référentiel) ─────────────────────────────────────
// Les mêmes camions reviennent voyage après voyage : le parc est saisi une
// fois, la réception y choisit l'immatriculation au lieu de la retaper.

/**
 * Clé de comparaison d'une immatriculation : majuscules, séparateurs retirés.
 * « 3201 GS 01 », « 3201-gs-01 » et « 3201GS01 » sont le même camion — sans
 * cette clé, chaque façon de l'écrire ouvrirait une fiche de plus.
 */
export function plateKey(registration: string): string {
  return registration.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Fiche du camion : son code interne (« STE-01 »), sur lequel le parc l'appelle
 * au quotidien, et son attelage habituel — recopié sur le bordereau à la
 * réception.
 */
const vehicleFields = {
  code: z.string().trim().max(20).nullable().optional(),
  brand: z.string().trim().max(50).nullable().optional(),
  driver: z.string().trim().max(100).nullable().optional(),
  trailer: z.string().trim().max(50).nullable().optional(),
};

export const vehicleCreateSchema = z.object({
  registration: z.string().trim().min(1, "Immatriculation requise").max(50),
  ...vehicleFields,
});
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;

export const vehicleUpdateSchema = z.object({
  registration: z.string().trim().min(1, "Immatriculation requise").max(50).optional(),
  // Camion sorti du parc : retiré du choix de la réception, jamais supprimé —
  // ses voyages passés doivent rester lisibles.
  active: z.boolean().optional(),
  ...vehicleFields,
});
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

export type VehicleDTO = {
  id: string;
  registration: string;
  plateKey: string;
  /** Code interne du parc (« STE-01 ») — `null` tant qu'il n'est pas attribué. */
  code: string | null;
  /** Marque (« RENAULT », « MERCEDES BENZ ») — texte libre. */
  brand: string | null;
  driver: string | null;
  trailer: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Voyages réceptionnés sous ce camion (tous contrats). */
  tripCount: number;
  /** Dernière arrivée au parc — `null` si le camion n'a jamais servi. */
  lastTripAt: string | null;
};

// Champs bordereau — édités progressivement, tous optionnels et « nullable »
// (vidé → détaché). Partagés entre création et mise à jour.
const truckBordereauFields = {
  deliveryNote: z.string().trim().max(50).nullable().optional(),
  parcel: z.string().trim().max(50).nullable().optional(),
  origin: z.string().trim().max(100).nullable().optional(),
  transporter: z.string().trim().max(100).nullable().optional(),
  driver: z.string().trim().max(100).nullable().optional(),
  trailer: z.string().trim().max(50).nullable().optional(),
  bookletNo: z.string().trim().max(50).nullable().optional(),
  bonNo: z.string().trim().max(50).nullable().optional(),
  smsCode: z.string().trim().max(50).nullable().optional(),
  followupAgent: z.string().trim().max(100).nullable().optional(),
  destination: z.string().trim().max(100).nullable().optional(),
  loadedAt: z.coerce.date().nullable().optional(),
  declaredFieldM3: decimalString.nullable().optional(),
  declaredLogCount: z.coerce.number().int().min(0).nullable().optional(),
  // Date d'arrivée réelle au parc (camion saisi après coup) — défaut serveur : now().
  arrivedAt: z.coerce.date().optional(),
};

export const truckCreateSchema = z.object({
  contractId: z.string().min(1),
  // Camion choisi dans le parc. Absent = immatriculation tapée à la main : le
  // serveur retrouve (ou crée) la fiche camion à partir d'elle.
  vehicleId: z.string().min(1).optional(),
  registration: z.string().trim().min(1, "Immatriculation requise").max(50),
  ...truckBordereauFields,
});
export type TruckCreateInput = z.infer<typeof truckCreateSchema>;

export const truckUpdateSchema = z.object({
  registration: z.string().trim().min(1).max(50).optional(),
  countGapConfirmed: z.boolean().optional(),
  ...truckBordereauFields,
});
export type TruckUpdateInput = z.infer<typeof truckUpdateSchema>;

// ── Packing list grumes (spécification de transport SODEFOR) ──────────
// Lecture seule : la saisie a été retirée de la fiche camion, seules les
// lignes déjà en base servent encore (volume de repli dans les résumés et
// préremplissage des n° de billes à l'étalage Ø).
export type PackingLogDTO = {
  id: string;
  position: number;
  billNo: string | null;
  diaTopCm: string | null;
  diaBottomCm: string | null;
  diaMeanCm: string | null;
  lengthM: string | null;
  volumeM3: string;
};

const girthLogInput = z.object({
  externalId: z.string().trim().max(30).optional(),
  lengthM: decimalString,
  circumferenceCm: decimalString,
});
const diameterLogInput = z.object({
  externalId: z.string().trim().max(30).optional(),
  lengthFt: decimalString,
  diameterIn: decimalString,
});

export const measurementCreateSchema = z.discriminatedUnion("context", [
  z.object({ context: z.literal("FIELD"), logs: z.array(girthLogInput).min(1) }),
  z.object({ context: z.literal("YARD_GIRTH"), logs: z.array(girthLogInput).min(1) }),
  z.object({ context: z.literal("YARD_DIAMETER"), logs: z.array(diameterLogInput).min(1) }),
]);
export type MeasurementCreateInput = z.infer<typeof measurementCreateSchema>;

// Correction d'une ligne de relevé déjà enregistrée (erreur de saisie au parc).
// Champs selon le contexte du relevé parent : m+cm (girth) ou ft+in (Ø) —
// vérifié côté route. `externalId: null` efface le n°.
export const logUpdateSchema = z.object({
  externalId: z.string().trim().max(30).nullable().optional(),
  lengthM: decimalString.optional(),
  circumferenceCm: decimalString.optional(),
  lengthFt: decimalString.optional(),
  diameterIn: decimalString.optional(),
});
export type LogUpdateInput = z.infer<typeof logUpdateSchema>;

export type LogDTO = {
  id: string;
  position: number;
  externalId: string | null;
  lengthM: string | null;
  lengthFt: string | null;
  diameterIn: string | null;
  circumferenceCm: string | null;
  volumeM3: string;
  cft: string | null;
};

export type MeasurementDTO = {
  id: string;
  truckId: string;
  context: MeasurementContext;
  measuredAt: string;
  logs: LogDTO[];
};

export type TruckDTO = {
  id: string;
  contractId: string;
  vehicleId: string | null;
  registration: string;
  deliveryNote: string | null;
  parcel: string | null;
  origin: string | null;
  transporter: string | null;
  driver: string | null;
  trailer: string | null;
  bookletNo: string | null;
  bonNo: string | null;
  smsCode: string | null;
  followupAgent: string | null;
  destination: string | null;
  loadedAt: string | null;
  declaredFieldM3: string | null;
  declaredLogCount: number | null;
  countGapConfirmed: boolean; // écart bordereau/parc confirmé « normal »
  arrivedAt: string;
  createdAt: string;
  updatedAt: string;
  sawn: boolean; // lié à ≥1 session de débitage
  measurements: MeasurementDTO[];
  packingLogs: PackingLogDTO[];
};

/** Total m³ d'un relevé (somme des lignes). */
export function measurementTotalM3(m: MeasurementDTO): number {
  return m.logs.reduce((s, l) => s + Number(l.volumeM3), 0);
}

// ── Traçabilité bille → billon ────────────────────────────────────────
// Chronologie réelle du parc : l'étalage mesure les BILLES (n° 266, 267…,
// numérotation continue inter-camions). La bille n'est ensuite jamais
// remesurée : le bois est nettoyé puis tronçonné, et la bille 266 devient
// les billons 266A, 266B, 266C… dont chacun reçoit sa propre mesure
// (L + circonférence = girth).
// Conséquence : un relevé girth compte des BILLONS, pas des billes — ne
// jamais comparer son nombre de lignes au comptage du bordereau.

const BILLON_SUFFIX_RE = /[A-Za-z]+$/;

/** N° de bille mère d'un billon : « 266A » → « 266 » ; « 266 » → « 266 ». */
export function billParent(externalId: string | null | undefined): string | null {
  const id = externalId?.trim();
  if (!id) return null;
  return id.replace(BILLON_SUFFIX_RE, "") || id;
}

/** Suffixe billon → rang : A=1, B=2… Z=26, AA=27 (suite type colonnes Excel). */
export function billonRank(suffix: string): number {
  let n = 0;
  for (const c of suffix.toUpperCase()) {
    const d = c.charCodeAt(0) - 64; // « A » = 1
    if (d < 1 || d > 26) return 0;
    n = n * 26 + d;
  }
  return n;
}

/** Rang → suffixe billon : 1 → « A », 7 → « G », 27 → « AA ». */
export function billonSuffix(rank: number): string {
  let n = Math.max(1, Math.trunc(rank));
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.trunc((n - 1) / 26);
  }
  return s;
}

/**
 * N° du prochain billon d'une bille : « 266 » + [266A, 266B] → « 266C ».
 * Reprend après le suffixe le plus haut déjà saisi (une ligne supprimée ne
 * fait pas réutiliser son n°, sinon deux billons porteraient le même).
 */
export function nextBillonId(
  bill: string,
  existingIds: Iterable<string | null | undefined>
): string {
  const parent = billParent(bill) ?? bill.trim();
  let max = 0;
  for (const id of existingIds) {
    const v = id?.trim();
    if (!v || billParent(v) !== parent) continue;
    max = Math.max(max, billonRank(BILLON_SUFFIX_RE.exec(v)?.[0] ?? ""));
  }
  return parent + billonSuffix(max + 1);
}

/** N° de bille suivant : « 266 » → « 267 » (numérotation continue du parc). */
export function nextBillId(previous: string | null | undefined): string {
  const m = /^(\D*)(\d+)$/.exec(previous?.trim() ?? "");
  if (!m) return "";
  const [, prefix, digits] = m;
  return prefix + String(Number(digits) + 1).padStart(digits.length, "0");
}

/** Billes mères distinctes d'une liste de billons (billon sans n° = compté seul). */
export function billCount(logs: { externalId: string | null }[]): number {
  const bills = new Set<string>();
  let unnamed = 0;
  for (const l of logs) {
    const p = billParent(l.externalId);
    if (p) bills.add(p);
    else unnamed += 1;
  }
  return bills.size + unnamed;
}

/**
 * Nombre de BILLES d'un relevé — girth : billons regroupés par bille mère
 * (275 billons = 60 billes) ; sinon 1 ligne = 1 bille.
 */
export function measurementBillCount(m: MeasurementDTO): number {
  return m.context === "YARD_GIRTH" ? billCount(m.logs) : m.logs.length;
}

/**
 * Billes présentes au parc, comparables au comptage du bordereau :
 * étalage diamètre (bille par bille) > billes mères du girth > brousse détaillée.
 */
export function truckBillCount(t: { measurements: MeasurementDTO[] }): number | null {
  for (const ctx of ["YARD_DIAMETER", "YARD_GIRTH", "FIELD"] as MeasurementContext[]) {
    const m = t.measurements.find((x) => x.context === ctx);
    if (m && m.logs.length > 0) return measurementBillCount(m);
  }
  return null;
}

/** N° des billes étalées d'un camion (étalage diamètre, sinon packing list). */
export function truckBillNos(t: {
  measurements: MeasurementDTO[];
  packingLogs?: { billNo: string | null }[];
}): string[] {
  const dia = t.measurements.find((m) => m.context === "YARD_DIAMETER");
  const fromDia = (dia?.logs ?? [])
    .map((l) => l.externalId?.trim())
    .filter((v): v is string => !!v);
  if (fromDia.length > 0) return fromDia;
  return (t.packingLogs ?? [])
    .map((p) => p.billNo?.trim())
    .filter((v): v is string => !!v);
}

// ── Avancement du débitage d'un camion ────────────────────────────────
// Croise billons girth × sessions. Règle de la saisie (« aucun coché = camion
// entier ») appliquée camion par camion : une session liée au camion sans
// AUCUN de ses billons cochés l'a scié en entier (comportement historique) ;
// sinon seuls ses billons cochés sont partis à la scie. Une session à deux
// camions peut donc scier l'un en entier et l'autre en partie.

export type TruckSawnProgress<L = LogDTO> = {
  total: number; // billons girth du camion
  sawn: number; // billons passés à la scie
  started: boolean; // ≥1 session liée au camion
  complete: boolean; // tout est scié
  remaining: L[]; // billons pas encore sciés
  girthM3: number; // cubage de tous les billons du camion
  /** Cubage des billons passés à la scie — dénominateur du rendement (F6). */
  sawnGirthM3: number;
};

/** Billon girth tel que le portent un DTO ou une ligne Prisma (Decimal). */
type GirthLog = { id: string; volumeM3: unknown };

export function truckSawnProgress<L extends GirthLog = LogDTO>(
  t: { id: string; measurements: { context: string; logs: L[] }[] },
  runs: Pick<ProductionRunDTO, "truckIds" | "logIds">[]
): TruckSawnProgress<L> {
  const billons = t.measurements
    .filter((m) => m.context === "YARD_GIRTH")
    .flatMap((m) => m.logs);
  const billonIds = new Set(billons.map((l) => l.id));
  const myRuns = runs.filter((r) => r.truckIds.includes(t.id));
  const wholeTruck = myRuns.some((r) => !r.logIds.some((id) => billonIds.has(id)));
  // logIds de TOUTES les sessions : un billon du camion peut être lié à une
  // session sans que le camion le soit (données saisies à la main / API).
  const sawnIds = new Set(runs.flatMap((r) => r.logIds));
  const remaining = wholeTruck ? [] : billons.filter((l) => !sawnIds.has(l.id));
  const sawn = billons.length - remaining.length;
  const started = myRuns.length > 0 || sawn > 0;
  const girthM3 = billons.reduce((s, l) => s + Number(l.volumeM3), 0);
  const remainingM3 = remaining.reduce((s, l) => s + Number(l.volumeM3), 0);
  return {
    total: billons.length,
    sawn,
    started,
    complete: started && (billons.length === 0 ? wholeTruck : sawn === billons.length),
    remaining,
    girthM3,
    sawnGirthM3: Math.max(girthM3 - remainingM3, 0),
  };
}

/**
 * Cubage des billons passés à la scie, par camion, à partir de listes à plat
 * (requêtes API) — même règle que truckSawnProgress : un lien session↔camion
 * sans aucun billon de ce camion coché = camion entier ; sinon billons cochés.
 * C'est le dénominateur du rendement (F6) tant qu'un camion n'est pas fini :
 * diviser par tous ses billons ferait chuter le rendement d'un camion entamé.
 */
export function sawnGirthByTruck(
  girthLogs: { id: string; truckId: string; volumeM3: unknown }[],
  runTrucks: { runId: string; truckId: string }[],
  runLogs: { runId: string; logId: string }[]
): Map<string, number> {
  const truckOfLog = new Map(girthLogs.map((l) => [l.id, l.truckId]));
  // Sessions ayant coché ≥1 billon d'un camion donné.
  const runsWithBillons = new Map<string, Set<string>>();
  for (const rl of runLogs) {
    const tid = truckOfLog.get(rl.logId);
    if (!tid) continue;
    let set = runsWithBillons.get(tid);
    if (!set) runsWithBillons.set(tid, (set = new Set()));
    set.add(rl.runId);
  }
  const wholeTrucks = new Set(
    runTrucks.filter((rt) => !runsWithBillons.get(rt.truckId)?.has(rt.runId)).map((rt) => rt.truckId)
  );
  const sawnLogIds = new Set(runLogs.map((rl) => rl.logId));
  const out = new Map<string, number>();
  for (const l of girthLogs) {
    if (!wholeTrucks.has(l.truckId) && !sawnLogIds.has(l.id)) continue;
    out.set(l.truckId, (out.get(l.truckId) ?? 0) + Number(l.volumeM3));
  }
  return out;
}

/**
 * Cubage des billons sciés par UNE session (rendement de la session, saisie
 * live) : billons cochés de chaque camion, ou le camion entier quand aucun de
 * ses billons ne l'est.
 */
export function runSawnGirthM3(
  trucks: { id: string; measurements: { context: string; logs: GirthLog[] }[] }[],
  logIds: string[]
): number {
  const checked = new Set(logIds);
  return trucks.reduce((sum, t) => {
    const billons = t.measurements
      .filter((m) => m.context === "YARD_GIRTH")
      .flatMap((m) => m.logs);
    const mine = billons.filter((l) => checked.has(l.id));
    const used = mine.length > 0 ? mine : billons;
    return sum + used.reduce((s, l) => s + Number(l.volumeM3), 0);
  }, 0);
}

// ── Comptes tiers ──────────────────────────────────────────────────────

export const PartyType = z.enum([
  "SUPPLIER",
  "TRANSPORTER",
  "CLIENT",
  "INTERNAL",
  "TAX_AUTHORITY",
  "OTHER",
]);
export type PartyType = z.infer<typeof PartyType>;

export const EntryKind = z.enum(["DUE", "PAID"]);
export type EntryKind = z.infer<typeof EntryKind>;

export const partyCreateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  type: PartyType.optional(),
  note: z.string().trim().max(500).optional(),
});
export type PartyCreateInput = z.infer<typeof partyCreateSchema>;

export const accountEntryCreateSchema = z.object({
  contractId: z.string().min(1),
  partyId: z.string().min(1),
  kind: EntryKind,
  amount: decimalString,
  description: z.string().trim().max(200).optional(),
  entryDate: z.coerce.date().optional(),
});
export type AccountEntryCreateInput = z.infer<typeof accountEntryCreateSchema>;

export type PartyDTO = {
  id: string;
  name: string;
  type: PartyType;
  note: string | null;
  createdAt: string;
};

export type AccountEntryDTO = {
  id: string;
  contractId: string;
  partyId: string;
  kind: EntryKind;
  amount: string;
  description: string | null;
  entryDate: string;
  createdAt: string;
};

export type ContractAccountDTO = {
  party: PartyDTO;
  due: string;
  paid: string;
  balance: string; // due − paid (positif = reste à payer)
  entries: AccountEntryDTO[];
};

// ── Vue liste (GET /contracts/overview) ───────────────────────────────
// Ce que les cartes des pages Contrats et Tableau de bord affichent, pour TOUS
// les contrats en une seule requête. Le résumé complet coûte 7 requêtes SQL par
// contrat : le demander carte par carte faisait un aller-retour par contrat.
// Les champs sont calculés exactement comme dans ContractSummaryDTO.
export type ContractOverviewDTO = {
  contractId: string;
  trucksEntered: number;
  trucksSawn: number; // camions avec au moins un débitage saisi
  brousseM3: string; // même règle que le résumé : étalage brousse > packing > déclaré
  estTrucksTotal: number | null;
  debitedM3: string;
  outputPct: string; // débité ÷ billons sciés (rendement scierie, F6)
  stockProductsM3: string; // débité + rescié entrant − vendu − rescié sortant
  salesRevenueCfa: string;
  balance: string; // dû − payé (positif = reste à payer)
};

// ── Résumé dérivé du contrat (GET /contracts/:id/summary) ─────────────
// Tout est calculé serveur depuis les opérations. Rien n'est stocké.

export type ContractSummaryDTO = {
  contractId: string;

  // Réception
  trucksEntered: number;
  trucksSawn: number;
  trucksOnParcUncut: number;
  trucksRemaining: number;
  totalUncut: number;
  // Estimation dérivée des arrivées : moyenne brousse des camions mesurés →
  // camions encore nécessaires pour finir le quota (null tant qu'aucun camion mesuré).
  avgBrousseM3PerTruck: string;
  estTrucksRemaining: number | null;
  estTrucksTotal: number | null;
  billeCount: number; // billes étalées (Ø ; sinon billes mères des billons, sinon bordereau)
  billonCount: number; // billons mesurés au girth (une bille en donne plusieurs)
  fieldM3: string;
  declaredFieldM3: string; // Σ cubage brousse déclaré (bordereaux)
  brousseM3: string; // brousse effective par camion (étalage/packing/déclaré) → quota
  girthM3: string;
  diaM3: string;

  // Production
  debitedM3: string;
  /** Billons passés à la scie (camion entier si session sans billon coché). */
  sawnGirthM3: string;
  // F6 : débité ÷ billons sciés × 100 — les billons qui attendent au parc ne
  // font plus baisser le rendement ; l'avancement = sawnGirthM3 ÷ girthM3.
  outputPct: string;
  quotaUsedPct: string; // girth ÷ quota × 100
  longM3: string; // avivés ≥ 6,5 ft
  shortM3: string; // avivés < 6,5 ft
  longPct: string;
  oneInchPct: string; // 1" ÷ débité × 100
  girthGte85M3: string; // billons ≥ 85 cm de circonférence
  girthLt85M3: string;

  // Stock
  stockBySize: StockSizeRowDTO[];
  stockProductsM3: string;
  stockParcM3: string; // girth des camions non sciés

  // Ventes
  salesRevenueCfa: string;
  soldM3: string;

  // Compta
  fullCost: string; // Σ DUE tous tiers
  totalPaid: string;
  balance: string;
  profitEstimate: string; // CA − fullCost
};

// ── Stock général ─────────────────────────────────────────────────────
// Le stock ne se découpe pas par contrat : le débité de tous les contrats
// tombe dans le même stock, et l'empotage y puise sans choisir de contrat.
// stock = produit + rescié entrant − vendu − rescié sortant
export type StockSizeRowDTO = {
  code: string;
  group: SizeGroup;
  producedM3: string;
  soldM3: string;
  resawnInM3: string; // produit par resciage
  resawnOutM3: string; // consommé par resciage
  stockM3: string;
};

/** GET /stock/summary — mêmes chiffres que le résumé contrat, tous contrats. */
export type StockSummaryDTO = {
  stockBySize: StockSizeRowDTO[];
  stockProductsM3: string;
  stockParcM3: string; // billons non sciés restants
  debitedM3: string;
  resawnInM3: string;
  resawnOutM3: string;
  soldM3: string;
};

/** GET /stock/parc — camions ayant encore des billons au parc (tous contrats). */
export type ParcTruckDTO = {
  truckId: string;
  contractId: string;
  contractCode: string;
  registration: string;
  deliveryNote: string | null;
  arrivedAt: string;
  /** Billons restants (girth non scié) — pas le total du camion. */
  billonCount: number;
  girthM3: string;
  girthGte85M3: string;
  girthLt85M3: string;
};

// ── Dépenses du contrat ───────────────────────────────────────────────
// Deux familles : les dépenses « calculées » (paramètres de prix × quantités
// réalisées, jamais stockées) et les dépenses « ajoutées » à la main (ce que
// les prix ne prévoient pas). Le total du contrat additionne les deux.

export const contractExpenseCreateSchema = z.object({
  contractId: z.string().min(1),
  label: z.string().trim().min(1, "Libellé requis").max(120),
  amount: decimalString,
  note: z.string().trim().max(300).optional(),
  expenseDate: z.coerce.date().optional(),
});
export type ContractExpenseCreateInput = z.infer<typeof contractExpenseCreateSchema>;

export type ContractExpenseDTO = {
  id: string;
  contractId: string;
  label: string;
  amount: string;
  note: string | null;
  expenseDate: string;
  createdAt: string;
};

/** Ligne dérivée d'un paramètre de prix : quantité réalisée × prix unitaire. */
export type ComputedExpenseDTO = {
  key:
    | "SODEFOR"
    | "IBRAHIM"
    | "TRANSPORT"
    | "CUBAGE"
    | "COMPANY"
    | "EXPORT"
    | "ONE_INCH"
    | "FEE_SODEFOR_R"
    | "FEE_SODEFOR_PLUS"
    | "FEE_REFORESTATION";
  label: string;
  /** Quantité réalisée (m³ ou camions) ; null pour un forfait fixe. */
  quantity: string | null;
  /** Unité de la quantité (« m³ brousse », « camions »…) ; null pour un forfait. */
  unit: string | null;
  unitPrice: string;
  amount: string;
  /** false tant que le prix n'est pas renseigné dans les termes (montant 0). */
  priced: boolean;
};

export type ContractExpensesDTO = {
  contractId: string;
  computed: ComputedExpenseDTO[];
  computedTotal: string;
  extra: ContractExpenseDTO[];
  extraTotal: string;
  total: string;
};

export type AccountSuggestionDTO = {
  partyId: string;
  partyName: string;
  role: "SODEFOR" | "CUBAGE" | "TRANSPORT";
  expected: string;
  existingDue: string;
  delta: string;
  label: string;
};

// ── Ventes / Export ────────────────────────────────────────────────────

const saleLineInput = z
  .object({
    sizeCode: z.string().trim().min(1).max(20),
    volumeM3: decimalString,
    unitPriceUsd: decimalString.optional(),
    usdCfaRate: decimalString.optional(),
    unitPriceCfa: decimalString.optional(),
  })
  .refine((l) => !!l.unitPriceCfa || (!!l.unitPriceUsd && !!l.usdCfaRate), {
    message: "Prix CFA direct, ou prix USD + taux",
  });

export const saleCreateSchema = z.object({
  contractId: z.string().min(1),
  clientId: z.string().min(1).nullable().optional(),
  saleDate: z.coerce.date().optional(),
  deliveryNote: z.string().trim().max(50).optional(),
  note: z.string().trim().max(200).optional(),
  lines: z.array(saleLineInput).min(1),
});
export type SaleCreateInput = z.infer<typeof saleCreateSchema>;

/** Montant CFA d'une ligne : CFA direct prioritaire, sinon USD × taux. */
export function saleLineAmountCfa(l: {
  volumeM3: number;
  unitPriceCfa?: number | null;
  unitPriceUsd?: number | null;
  usdCfaRate?: number | null;
}): number {
  if (l.unitPriceCfa != null && l.unitPriceCfa > 0) return l.volumeM3 * l.unitPriceCfa;
  if (l.unitPriceUsd != null && l.usdCfaRate != null)
    return l.volumeM3 * l.unitPriceUsd * l.usdCfaRate;
  return 0;
}

export type SaleLineDTO = {
  id: string;
  position: number;
  sizeCode: string;
  volumeM3: string;
  unitPriceUsd: string | null;
  usdCfaRate: string | null;
  unitPriceCfa: string | null;
  amountCfa: string;
};

export type SaleDTO = {
  id: string;
  contractId: string;
  clientId: string | null;
  saleDate: string;
  deliveryNote: string | null;
  note: string | null;
  createdAt: string;
  lines: SaleLineDTO[];
};

export function saleTotalCfa(s: SaleDTO): number {
  return s.lines.reduce((sum, l) => sum + Number(l.amountCfa), 0);
}

export function saleTotalM3(s: SaleDTO): number {
  return s.lines.reduce((sum, l) => sum + Number(l.volumeM3), 0);
}

// ── Conteneurs / Empotage (F3) ────────────────────────────────────────

export const ContainerStatus = z.enum(["PLANNED", "LOADING", "LOADED", "SHIPPED"]);
export type ContainerStatus = z.infer<typeof ContainerStatus>;

export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  PLANNED: "Prévu",
  LOADING: "En empotage",
  LOADED: "Empoté",
  SHIPPED: "Expédié",
};

const containerItemInput = z.object({
  lengthFt: decimalString,
  widthIn: decimalString,
  thicknessIn: decimalString,
  count: z.coerce.number().int().min(1),
});

export const containerCreateSchema = z.object({
  // Pas de contractId : l'empotage puise dans le stock général.
  clientId: z.string().min(1).nullable().optional(),
  containerNo: z.string().trim().min(1, "N° conteneur requis").max(30),
  sealNo: z.string().trim().max(30).optional(),
  fauxSealNo: z.string().trim().max(30).optional(),
  bookingNo: z.string().trim().max(30).optional(),
  grade: z.string().trim().max(30).optional(),
  destination: z.string().trim().max(60).optional(),
  status: ContainerStatus.optional(),
  truckIds: z.array(z.string().min(1)).optional(),
  items: z.array(containerItemInput).optional(),
});
export type ContainerCreateInput = z.infer<typeof containerCreateSchema>;

export const containerUpdateSchema = z.object({
  clientId: z.string().min(1).nullable().optional(),
  containerNo: z.string().trim().min(1).max(30).optional(),
  sealNo: z.string().trim().max(30).nullable().optional(),
  fauxSealNo: z.string().trim().max(30).nullable().optional(),
  bookingNo: z.string().trim().max(30).nullable().optional(),
  grade: z.string().trim().max(30).nullable().optional(),
  destination: z.string().trim().max(60).nullable().optional(),
  status: ContainerStatus.optional(),
  truckIds: z.array(z.string().min(1)).optional(),
});
export type ContainerUpdateInput = z.infer<typeof containerUpdateSchema>;

export const containerItemsAddSchema = z.object({
  items: z.array(containerItemInput).min(1),
});
export type ContainerItemsAddInput = z.infer<typeof containerItemsAddSchema>;

export type ContainerItemDTO = {
  id: string;
  position: number;
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  count: number;
  sizeCode: string;
  sizeGroup: SizeGroup;
  volumeM3: string;
};

export type ContainerDTO = {
  id: string;
  /** Legacy : conteneurs créés avant le stock général. Plus jamais renseigné. */
  contractId: string | null;
  clientId: string | null;
  containerNo: string;
  sealNo: string | null;
  fauxSealNo: string | null;
  bookingNo: string | null;
  grade: string | null;
  destination: string | null;
  status: ContainerStatus;
  loadedAt: string | null;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
  truckIds: string[];
  items: ContainerItemDTO[];
};

// ── Stock d'avivés par dimension exacte (GET /contracts/:id/sawn-inventory) ──
// L'empotage se choisit pièce par pièce dans du bois réel : il faut le stock à
// la granularité L×l×ép (le stock par taille du résumé n'est qu'en m³).
// Les ventes ne portent ni dimensions ni nombre de pièces : elles ne peuvent
// pas être déduites ici. Disponible = débité + rescié entrant − rescié sortant
// − déjà empoté.
export type SawnInventoryRowDTO = {
  key: string; // "6.5x6x3" — identifiant de regroupement
  lengthFt: string;
  widthIn: string;
  thicknessIn: string;
  sizeCode: string;
  sizeGroup: SizeGroup;
  producedCount: number;
  resawnInCount: number;
  resawnOutCount: number;
  packedCount: number; // déjà empoté (tous conteneurs du contrat)
  availableCount: number;
  unitM3: string; // volume d'une pièce
  availableM3: string;
};

export function containerTotalM3(c: ContainerDTO): number {
  return c.items.reduce((s, i) => s + Number(i.volumeM3), 0);
}

export function containerPieceCount(c: ContainerDTO): number {
  return c.items.reduce((s, i) => s + i.count, 0);
}

// Une « section » = un couple largeur × épaisseur (8×6, 9×7…). C'est l'unité de
// lecture du document d'empotage réel : les paquets partent en conteneur par
// section, longueurs décroissantes à l'intérieur. Le sizeGroup (MAIN/SIDE/…)
// est trop grossier pour ça.
export type ContainerSectionDTO = {
  key: string; // "8x6"
  widthIn: string;
  thicknessIn: string;
  sizeCode: string;
  sizeGroup: SizeGroup;
  items: ContainerItemDTO[]; // longueur décroissante
  count: number;
  volumeM3: number;
};

export function containerSections(c: ContainerDTO): ContainerSectionDTO[] {
  const map = new Map<string, ContainerSectionDTO>();
  for (const it of c.items) {
    const key = `${Number(it.widthIn)}x${Number(it.thicknessIn)}`;
    let sec = map.get(key);
    if (!sec) {
      sec = {
        key,
        widthIn: it.widthIn,
        thicknessIn: it.thicknessIn,
        sizeCode: it.sizeCode,
        sizeGroup: it.sizeGroup,
        items: [],
        count: 0,
        volumeM3: 0,
      };
      map.set(key, sec);
    }
    sec.items.push(it);
    sec.count += it.count;
    sec.volumeM3 += Number(it.volumeM3);
  }
  const out = [...map.values()];
  out.sort(
    (a, b) =>
      Number(a.widthIn) - Number(b.widthIn) ||
      Number(a.thicknessIn) - Number(b.thicknessIn)
  );
  for (const sec of out) sec.items.sort((a, b) => Number(b.lengthFt) - Number(a.lengthFt));
  return out;
}

export type TruckStatDTO = {
  truckId: string;
  registration: string;
  deliveryNote: string | null;
  arrivedAt: string;
  sawn: boolean;
  billeCount: number; // billes étalées
  /** Billes par relevé d'étalage (colonnes A/B/C du Daily Truck Log) — Σ = billeCount. */
  billeCounts: number[];
  billonCount: number; // billons issus du tronçonnage
  fieldM3: string;
  girthM3: string;
  girthGte85M3: string;
  girthLt85M3: string;
  diaM3: string;
  /** Débité attribué (Σ sessions liées ÷ nb camions liés — approximation si session multi-camions). */
  debitedM3: string;
  /** Billons passés à la scie (camion entier si session sans billon coché) — base du rendement. */
  sawnGirthM3: string;
  /** Rendement F6 : débité ÷ billons sciés (pas ÷ tous les billons d'un camion entamé). */
  outputPct: string;
  // ── Daily Truck Log : splits du débité par bande d'épaisseur / longueur ──
  mainM3: string; // ép ≥ 3" (MAIN SIZE)
  band15M3: string; // ép 1,5 – 3" (colonne 1.5")
  msM3: string; // MAIN + 1.5" (MS)
  oneInchM3: string; // ép < 1,5" (colonne 1")
  oneInchPct: string; // 1" ÷ débité
  longM3: string; // ≥ 6,5 ft
  shortM3: string;
  /** Coût FCFA/m³ débité (truckCostCfa ÷ débité) — null si non scié. */
  costPerM3: string | null;
  /** Coût FCFA/m³ MS (truckCostCfa ÷ MS) — null si MS = 0. */
  costMsPerM3: string | null;
};

export type DailyReportDTO = {
  date: string;
  contractCode: string;
  arrivals: {
    registration: string;
    deliveryNote: string | null;
    parcel: string | null;
    origin: string | null;
    fieldM3: string | null;
    logCount: number | null;
  }[];
  tallies: {
    registration: string;
    context: MeasurementContext;
    totalM3: string;
    logCount: number; // lignes du relevé : billes (brousse/Ø) ou billons (girth)
    billCount: number | null; // girth : billes mères des billons
    girthGte85M3: string | null;
    girthLt85M3: string | null;
  }[];
  production: {
    note: string | null;
    trucks: string[]; // immatriculations liées
    totalM3: string;
    pieces: number;
    girthLinkedM3: string | null;
    outputPct: string | null;
    longM3: string;
    shortM3: string;
    longPct: string;
    bands: { label: string; m3: string; pct: string }[];
  }[];
  loadings: {
    containerNo: string;
    sealNo: string | null;
    fauxSealNo: string | null;
    bookingNo: string | null;
    destination: string | null;
    grade: string | null;
    totalM3: string;
    pieces: number;
  }[];
};
