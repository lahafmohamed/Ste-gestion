import { useEffect, useRef, useState } from "react";
import {
  GIRTH_SPLIT_CM,
  M3_TO_CFT,
  billParent,
  nextBillId,
  nextBillonId,
  volumeDiameterM3,
  volumeGirthM3,
  type MeasurementCreateInput,
  type MeasurementContext,
} from "@ste/shared";
import { fmtNum, normalizeDecimal } from "../lib/format";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Chip from "./ui/Chip";
import { FormError } from "./ui/Feedback";
import { inputQuietCls } from "./ui/Input";

// `id` : clé React stable. Avec l'index, supprimer la ligne 3 décalait toutes
// les suivantes — React réutilisait les <input> et le focus atterrissait sur la
// mauvaise ligne au milieu d'un relevé.
type RowState = { id: string; externalId: string; a: string; b: string };

let rowSeq = 0;
const nextRowId = () => `r${++rowSeq}`;

/** Nb de pastilles de billes affichées avant de replier le sélecteur. */
const BILL_CHIPS = 12;

const KIND = {
  girth: {
    aLabel: "L (m)",
    bLabel: "Circ (cm)",
    idLabel: "N° billon",
    unit: "billon",
    compute: volumeGirthM3,
  },
  dia: {
    aLabel: "L (m)",
    bLabel: "Ø (cm)",
    idLabel: "N° bille",
    unit: "bille",
    compute: volumeDiameterM3,
  },
} as const;

function kindOf(ctx: MeasurementContext): keyof typeof KIND {
  return ctx === "YARD_DIAMETER" ? "dia" : "girth";
}

const emptyRow = (externalId = ""): RowState => ({ id: nextRowId(), externalId, a: "", b: "" });

// ── Brouillon localStorage ────────────────────────────────────────────
// La saisie au parc dure de longues minutes sur tablette : un écran verrouillé
// ou un onglet tué ne doit pas coûter 275 lignes. Sauvé à chaque frappe,
// restauré à l'ouverture, purgé par le parent après enregistrement réussi.

function rowEmpty(r: RowState) {
  return !r.externalId.trim() && !r.a.trim() && !r.b.trim();
}

function loadDraft(key: string | undefined): RowState[] | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`tally-draft:${key}`);
    if (!raw) return null;
    const raw2 = JSON.parse(raw) as Partial<RowState>[];
    if (!Array.isArray(raw2) || raw2.length === 0) return null;
    // Id réattribué à la lecture : les brouillons d'avant n'en ont pas, et un id
    // de session précédente pourrait entrer en collision avec le compteur courant.
    const rows: RowState[] = raw2.map((r) => ({
      id: nextRowId(),
      externalId: r.externalId ?? "",
      a: r.a ?? "",
      b: r.b ?? "",
    }));
    return rows.some((r) => !rowEmpty(r)) ? rows : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, rows: RowState[]) {
  try {
    if (rows.every(rowEmpty)) localStorage.removeItem(`tally-draft:${key}`);
    else localStorage.setItem(`tally-draft:${key}`, JSON.stringify(rows));
  } catch {
    // stockage plein/indisponible : la saisie en cours reste en mémoire
  }
}

/** À appeler après enregistrement réussi (le brouillon devient obsolète). */
export function clearTallyDraft(key: string) {
  try {
    localStorage.removeItem(`tally-draft:${key}`);
  } catch {
    // rien à purger si le stockage est indisponible
  }
}

function rowVolume(kind: keyof typeof KIND, r: RowState): number | null {
  const a = Number(r.a);
  const b = Number(r.b);
  if (!r.a || !r.b || !(a > 0) || !(b > 0)) return null;
  return KIND[kind].compute(a, b);
}

type Props = {
  context: MeasurementContext;
  onSave?: (data: MeasurementCreateInput) => void;
  saving?: boolean;
  /** Mode embarqué : pas de bouton Valider — le parent lit les lignes via onRowsChange. */
  embedded?: boolean;
  onRowsChange?: (logs: MeasurementCreateInput["logs"], validCount: number) => void;
  /** Annoncé à la réception (bordereau) → affiche les écarts live pendant la saisie. */
  declared?: { count?: number | null; m3?: number | null };
  /**
   * Girth : n° des billes étalées → sélecteur qui numérote les billons
   * (266 → 266A, 266B, 266C…). La bille n'est pas remesurée : chaque billon
   * issu du tronçonnage porte sa propre mesure.
   */
  bills?: string[];
  /** N° déjà enregistrés dans ce relevé (mode « continuer l'étalage »). */
  existingIds?: string[];
  /** Clé du brouillon localStorage (ex `truckId:YARD_GIRTH`) — voir clearTallyDraft. */
  draftKey?: string;
  /** N° préremplis (ex depuis la packing list) — une ligne par n°, mesures à saisir. */
  initialIds?: string[];
  /** Échec du dernier enregistrement — affiché contre le bouton Valider, là où
   *  se trouve le pointeur quand ça casse (le brouillon, lui, est conservé). */
  error?: string | null;
};

export default function TallyEntry({
  context,
  onSave,
  saving = false,
  embedded = false,
  onRowsChange,
  declared,
  bills,
  existingIds,
  draftKey,
  initialIds,
  error,
}: Props) {
  const kind = kindOf(context);
  const isGirth = kind === "girth";
  // Priorité : brouillon interrompu > n° préremplis > une ligne vierge.
  const [rows, setRows] = useState<RowState[]>(
    () =>
      loadDraft(draftKey) ??
      (initialIds?.length ? initialIds.map((id) => emptyRow(id)) : [emptyRow()])
  );
  const restored = useRef(loadDraft(draftKey) !== null);
  const [undo, setUndo] = useState<{ row: RowState; index: number } | null>(null);
  const [allBills, setAllBills] = useState(false);

  // Brouillon : débouncé. À 275 lignes, un JSON.stringify + écriture
  // localStorage synchrone à chaque frappe se sent au doigt sur tablette.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Enregistrement demandé → le parent purge le brouillon ; ne pas le réécrire
  // au démontage (sinon la saisie « revient » après un enregistrement réussi).
  const submitted = useRef(false);

  useEffect(() => {
    if (!draftKey) return;
    submitted.current = false;
    const t = setTimeout(() => saveDraft(draftKey, rowsRef.current), 400);
    return () => clearTimeout(t);
  }, [draftKey, rows]);

  // Écran verrouillé, onglet tué, navigation : flush immédiat de ce que le
  // debounce n'a pas encore écrit.
  useEffect(() => {
    if (!draftKey) return;
    const flush = () => saveDraft(draftKey, rowsRef.current);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      if (!submitted.current) flush();
    };
  }, [draftKey]);

  // Enregistrement échoué → le brouillon redevient la seule copie : réautoriser
  // le flush au démontage.
  useEffect(() => {
    if (error) submitted.current = false;
  }, [error]);

  // Refs sur le champ L de chaque ligne → focus auto sur la nouvelle ligne
  // (saisie au parc, au pouce : + Bille enchaîne sans viser le champ).
  const aRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIdx = useRef<number | null>(null);

  const volumes = rows.map((r) => rowVolume(kind, r));
  const validCount = volumes.filter((v) => v !== null).length;
  const total = volumes.reduce<number>((s, v) => s + (v ?? 0), 0);
  // Ligne commencée mais inexploitable (longueur ou Ø/circonférence manquant) :
  // elle est écartée à l'enregistrement — le pointeur doit le voir avant, pas
  // découvrir un total à 12 lignes alors qu'il en a tapé 15.
  const incompleteCount = rows.filter((r, i) => volumes[i] === null && !rowEmpty(r)).length;

  // Tous les n° connus du relevé (déjà enregistrés + en cours de saisie) →
  // base du prochain suffixe billon.
  const knownIds = [...(existingIds ?? []), ...rows.map((r) => r.externalId)];

  // N° saisi deux fois : soit une faute de frappe, soit une pièce comptée deux
  // fois — dans les deux cas le cubage est faux et personne ne le voit après coup.
  const idCounts = new Map<string, number>();
  for (const id of knownIds) {
    const k = id.trim().toUpperCase();
    if (k) idCounts.set(k, (idCounts.get(k) ?? 0) + 1);
  }
  const isDup = (externalId: string) => {
    const k = externalId.trim().toUpperCase();
    return !!k && (idCounts.get(k) ?? 0) > 1;
  };
  const dupCount = rows.filter((r) => isDup(r.externalId)).length;

  // Billes couvertes par la saisie girth : c'est ce nombre-là qui se compare au
  // bordereau (275 billons peuvent ne représenter que 60 billes).
  const billsTouched = new Set<string>();
  let unnamedValid = 0;
  if (isGirth) {
    rows.forEach((r, i) => {
      if (volumes[i] == null) return;
      const p = billParent(r.externalId);
      if (p) billsTouched.add(p);
      else unnamedValid += 1;
    });
  }
  const billValidCount = isGirth ? billsTouched.size + unnamedValid : validCount;

  // Nb de billons déjà saisis par bille → badge du sélecteur.
  const billonsPerBill = new Map<string, number>();
  if (isGirth && bills?.length) {
    for (const id of knownIds) {
      const p = billParent(id);
      if (p) billonsPerBill.set(p, (billonsPerBill.get(p) ?? 0) + 1);
    }
  }
  // Billes pas encore tronçonnées, dans l'ordre du parc. Repliées par défaut :
  // un camion de 60 billes remplissait l'écran de pastilles.
  const untouchedBills = (bills ?? []).filter(
    (b) => (billonsPerBill.get(billParent(b) ?? b) ?? 0) === 0
  );
  const nextBill = untouchedBills[0] ?? null;
  const visibleBills = allBills ? (bills ?? []) : untouchedBills.slice(0, BILL_CHIPS);

  // Bille en cours (dernière ligne avec un n°) : une bille tronçonnée donne
  // souvent 2-3 billons — le suivant de la même bille doit être à un tap, sans
  // rouvrir « Toutes » (sa pastille disparaît dès qu'elle est entamée).
  let currentBill: string | null = null;
  if (isGirth && bills?.length) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const p = billParent(rows[i].externalId);
      if (p) {
        currentBill = p;
        break;
      }
    }
  }

  // Split girth ≥85 / <85 cm live (miroir GIRTH_SPLIT_CM du backend) — recoupe
  // le « VOL G ≥85 / <85 » du slip terrain pendant la saisie.
  let ge85 = 0;
  let ge85n = 0;
  let lt85 = 0;
  let lt85n = 0;
  if (isGirth) {
    rows.forEach((r, i) => {
      if (volumes[i] == null) return;
      if (Number(r.b) >= GIRTH_SPLIT_CM) {
        ge85 += volumes[i]!;
        ge85n += 1;
      } else {
        lt85 += volumes[i]!;
        lt85n += 1;
      }
    });
  }

  function buildLogs() {
    return rows
      .filter((_, i) => volumes[i] !== null)
      .map((r) => {
        const base = r.externalId.trim() ? { externalId: r.externalId.trim() } : {};
        return kind === "dia"
          ? { ...base, lengthFt: r.a.trim(), diameterIn: r.b.trim() }
          : { ...base, lengthM: r.a.trim(), circumferenceCm: r.b.trim() };
      }) as MeasurementCreateInput["logs"];
  }

  // Mode embarqué : remonter les lignes valides au parent à chaque frappe.
  useEffect(() => {
    onRowsChange?.(buildLogs(), validCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, context]);

  // Après ajout d'une ligne, focus le champ L de la nouvelle (saisie continue).
  useEffect(() => {
    if (focusIdx.current !== null) {
      aRefs.current[focusIdx.current]?.focus();
      focusIdx.current = null;
    }
  }, [rows]);

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addRow(externalId?: string) {
    setRows((p) => {
      // Étalage billes : n° continu (266 → 267) repris de la dernière ligne.
      const auto =
        externalId ??
        (kind === "dia" ? nextBillId(p[p.length - 1]?.externalId) : "");
      // Ligne vierge en fin de liste → la remplir plutôt qu'en ajouter une.
      const last = p[p.length - 1];
      if (last && !last.externalId && !last.a && !last.b) {
        focusIdx.current = p.length - 1;
        return p.map((r, j) => (j === p.length - 1 ? { ...r, externalId: auto } : r));
      }
      focusIdx.current = p.length;
      return [...p, emptyRow(auto)];
    });
  }

  /** Bille tronçonnée : ajoute le billon suivant (266 → 266A, puis 266B…). */
  function addBillon(bill: string) {
    addRow(nextBillonId(bill, knownIds));
  }

  // Suppression annulable : la croix est à côté du champ Ø, au pouce sur
  // tablette une ligne mesurée peut partir sans qu'on s'en aperçoive.
  function removeRow(i: number) {
    if (rows.length <= 1) return;
    setUndo({ row: rows[i], index: i });
    setRows((p) => p.filter((_, j) => j !== i));
  }

  function restoreRow() {
    if (!undo) return;
    setRows((p) => [...p.slice(0, undo.index), undo.row, ...p.slice(undo.index)]);
    setUndo(null);
  }

  function save() {
    const logs = buildLogs();
    if (logs.length === 0) return;
    submitted.current = true;
    onSave?.({ context, logs } as MeasurementCreateInput);
  }

  // Variante « quiet » partagée (voir ui/Input) : 16px anti-zoom iOS,
  // min-h-touch 44px, bordure légère pour la grille de relevé.
  const inputCls = inputQuietCls;
  // Dernière colonne à 2,75rem : la croix doit être une vraie cible tactile,
  // séparée du champ Ø qu'elle jouxte.
  // Téléphone (< sm) : la ligne se replie en carte 2 rangées — rangée 1 :
  // n° + mesures (mini-libellés), rangée 2 : m³ + suppression. Même ordre DOM,
  // le focus auto et l'Entrée-chaînage ne changent pas.
  const cols =
    "grid grid-cols-[1.6rem_1fr_1fr_1fr_2.75rem] sm:grid-cols-[1.6rem_1fr_1fr_1fr_4.5rem_2.75rem] items-center gap-1";

  return (
    <div>
      {/* Brouillon restauré après interruption (reload, écran verrouillé…) */}
      {restored.current && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Saisie interrompue restaurée ({validCount} ligne{validCount > 1 ? "s" : ""} valide{validCount > 1 ? "s" : ""})</span>
          <button
            type="button"
            onClick={() => {
              restored.current = false;
              if (draftKey) clearTallyDraft(draftKey);
              setRows([emptyRow()]);
            }}
            className="-my-2 min-h-touch shrink-0 rounded-lg px-2 font-medium text-amber-700 underline hover:text-amber-900 active:bg-amber-100"
          >
            Repartir à zéro
          </button>
        </div>
      )}

      {/* Sélecteur de bille mère — après nettoyage/tronçonnage, taper la bille
          crée directement le billon suivant avec son n° (266A, 266B, 266C…). */}
      {isGirth && bills && bills.length > 0 && (
        <div className="mb-3 rounded-lg bg-brand-50 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-brand-500">
            <span>
              Bille tronçonnée → nouveau billon ({billsTouched.size}/{bills.length} billes
              entamées)
            </span>
            {bills.length > BILL_CHIPS && (
              <button
                type="button"
                onClick={() => setAllBills((s) => !s)}
                className="-my-2 min-h-touch shrink-0 rounded-lg px-2 underline hover:text-brand-900 active:bg-brand-200"
              >
                {allBills ? "Réduire" : `Toutes (${bills.length})`}
              </button>
            )}
          </div>

          {/* Le parc se dépile dans l'ordre : la bille suivante à tronçonner
              mérite un bouton pleine largeur, pas d'être cherchée dans 60
              pastilles. Une bille donne souvent plusieurs billons → « Même
              bille » enchaîne 266A → 266B sans rouvrir le sélecteur. */}
          {(nextBill || currentBill) && (
            <div className={`mb-2 grid gap-2 ${nextBill && currentBill ? "grid-cols-2" : ""}`}>
              {currentBill && (
                <Button
                  size="lg"
                  className="w-full tabular-nums"
                  onClick={() => addBillon(currentBill)}
                >
                  Même bille · {nextBillonId(currentBill, knownIds)}
                </Button>
              )}
              {nextBill && (
                <Button
                  variant="parc"
                  size="lg"
                  className="w-full tabular-nums"
                  onClick={() => addBillon(nextBill)}
                >
                  Bille suivante · {nextBill}
                </Button>
              )}
            </div>
          )}
          {!nextBill && !allBills && (
            <p className="mb-2 text-xs text-brand-500">Toutes les billes sont entamées.</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {visibleBills.map((b) => {
              const n = billonsPerBill.get(billParent(b) ?? b) ?? 0;
              return (
                <Chip
                  key={b}
                  size="lg"
                  selected={n > 0}
                  className="tabular-nums"
                  onClick={() => addBillon(b)}
                >
                  {b}
                  {n > 0 && <span className="ml-1 text-xs opacity-70">×{n}</span>}
                </Chip>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto sm:overflow-visible">
      <div className="sm:min-w-[460px]">
      {/* En-tête de colonnes : inutile sous sm (mini-libellés dans les cartes),
          collant sous le header fixe pendant les longs relevés dès sm. */}
      <div className="hidden items-center gap-1 text-xs text-brand-500 sm:sticky sm:top-header sm:z-10 sm:grid sm:grid-cols-[1.6rem_1fr_1fr_1fr_4.5rem_2.75rem] sm:rounded-lg sm:bg-white sm:py-1">
        <span>#</span>
        <span>{KIND[kind].idLabel}</span>
        <span>{KIND[kind].aLabel}</span>
        <span>{KIND[kind].bLabel}</span>
        <span className="text-right">m³</span>
        <span />
      </div>

      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`mt-1 ${cols} border-b border-brand-100 pb-2 sm:border-b-0 sm:pb-0`}
        >
          <span className="text-xs text-brand-400">{i + 1}</span>
          <div className="min-w-0">
            <span aria-hidden="true" className="mb-0.5 block text-xs text-brand-500 sm:hidden">
              {KIND[kind].idLabel}
            </span>
            <input
              value={r.externalId}
              onChange={(e) => setRow(i, { externalId: e.target.value })}
              placeholder={isGirth ? "266A (opt.)" : "N° (opt.)"}
              aria-label={`${KIND[kind].idLabel} ligne ${i + 1}`}
              className={`${inputCls} ${
                isDup(r.externalId) ? "border-amber-400 bg-amber-50 text-amber-900" : ""
              }`}
            />
          </div>
          <div className="min-w-0">
            <span aria-hidden="true" className="mb-0.5 block text-xs text-brand-500 sm:hidden">
              {KIND[kind].aLabel}
            </span>
            <input
              ref={(el) => {
                aRefs.current[i] = el;
              }}
              inputMode="decimal"
              value={r.a}
              onChange={(e) => setRow(i, { a: normalizeDecimal(e.target.value) })}
              aria-label={`${KIND[kind].aLabel} ligne ${i + 1}`}
              className={inputCls}
            />
          </div>
          <div className="min-w-0">
            <span aria-hidden="true" className="mb-0.5 block text-xs text-brand-500 sm:hidden">
              {KIND[kind].bLabel}
            </span>
            <input
              inputMode="decimal"
              value={r.b}
              onChange={(e) => setRow(i, { b: normalizeDecimal(e.target.value) })}
              aria-label={`${KIND[kind].bLabel} ligne ${i + 1}`}
              onKeyDown={(e) => {
                // Desktop : Entrée sur la dernière ligne = nouvelle ligne.
                // (Clavier numérique mobile n'a pas de Entrée → bouton + Bille ci-dessous.)
                if (e.key === "Enter" && i === rows.length - 1) {
                  e.preventDefault();
                  // Girth : enchaîner sur le billon suivant de la même bille.
                  addRow(isGirth && r.externalId ? nextBillonId(r.externalId, knownIds) : undefined);
                }
              }}
              className={inputCls}
            />
          </div>
          <span className="col-span-3 col-start-2 text-right text-base tabular-nums text-brand-700 sm:col-auto">
            <span className="mr-1 text-xs text-brand-400 sm:hidden">m³</span>
            {volumes[i] !== null ? volumes[i]!.toFixed(3) : "—"}
          </span>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="flex min-h-touch w-full items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500"
            aria-label={`Supprimer la ligne ${i + 1}`}
          >
            ×
          </button>
        </div>
      ))}
      </div>
      </div>

      <button
        type="button"
        onClick={() => addRow()}
        className="mt-2 min-h-touch w-full rounded-lg border border-dashed border-brand-300 py-2.5 text-base font-medium text-brand-600 hover:border-brand-900 hover:text-brand-900 active:bg-brand-100"
      >
        + {isGirth ? "Billon" : "Bille"}
      </button>

      {/* Récap + validation collés en bas de l'écran : à la ligne 200 d'un
          relevé, le total courant et le bouton Valider étaient 200 lignes plus
          bas. En mode embarqué le parent gère sa propre validation. */}
      <div
        className={
          embedded
            ? "mt-3"
            : "sticky bottom-0 z-10 mt-3 rounded-lg border border-brand-200 bg-white p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-8px_rgba(15,23,42,0.35)]"
        }
      >
      {/* Ligne supprimée par erreur → un tap pour la remettre à sa place. */}
      {undo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-brand-900 px-3 py-2 text-sm text-white">
          <span>
            Ligne {undo.index + 1} supprimée
            {undo.row.externalId.trim() ? ` (n° ${undo.row.externalId.trim()})` : ""}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={restoreRow}
              className="-my-2 min-h-touch rounded-lg px-2 font-medium underline active:bg-white/20"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => setUndo(null)}
              aria-label="Masquer"
              className="-my-2 min-h-touch rounded-lg px-2 text-base text-brand-400 hover:text-white active:bg-white/20"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-brand-500">
            Total ({validCount} {KIND[kind].unit}
            {validCount > 1 ? "s" : ""}
            {isGirth && billValidCount > 0 && ` · ${billValidCount} bille${billValidCount > 1 ? "s" : ""}`}
            )
          </span>
          <span className="font-semibold text-brand-900">
            {fmtNum(total.toFixed(6))} m³
            {kind === "dia" && total > 0 && (
              <span className="ml-2 text-xs font-normal text-brand-500">
                CFT {fmtNum((total * M3_TO_CFT).toFixed(2))}
              </span>
            )}
          </span>
        </div>
        {isGirth && validCount > 0 && (
          <div className="mt-1 flex items-center justify-between text-sm text-brand-500">
            <span>
              ≥85&nbsp;cm :{" "}
              <span className="tabular-nums text-brand-700">{fmtNum(ge85.toFixed(3))}</span> m³ ({ge85n})
            </span>
            <span>
              &lt;85 :{" "}
              <span className="tabular-nums text-brand-700">{fmtNum(lt85.toFixed(3))}</span> m³ ({lt85n})
            </span>
          </div>
        )}

        {/* Écarts live vs annoncé au bordereau — le pointeur voit tout de suite s'il manque des billes. */}
        {declared != null && (declared.count != null || declared.m3 != null) && (
          <div className="mt-2 space-y-1 border-t border-brand-200 pt-2 text-sm">
            {declared.count != null && (
              <div className="flex items-center justify-between">
                <span className="text-brand-500">
                  Billes : {billValidCount} / {declared.count} annoncées
                </span>
                <Badge
                  tone={billValidCount === declared.count ? "parc" : "amber"}
                  className="tabular-nums"
                >
                  {billValidCount === declared.count
                    ? "compte bon ✓"
                    : `écart ${billValidCount - declared.count > 0 ? "+" : ""}${billValidCount - declared.count}`}
                </Badge>
              </div>
            )}
            {declared.m3 != null && declared.m3 > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-brand-500">
                  Volume : {fmtNum(total.toFixed(3))} / {fmtNum(declared.m3.toFixed(3))} m³ brousse
                </span>
                <Badge
                  tone={Math.abs(total - declared.m3) / declared.m3 <= 0.05 ? "parc" : "amber"}
                  className="tabular-nums"
                >
                  {total - declared.m3 >= 0 ? "+" : ""}
                  {fmtNum((total - declared.m3).toFixed(3))} m³
                </Badge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* N° en double — le total est faux et rien ne le signale après coup. */}
      {dupCount > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {dupCount} n° en double (surlignés) — même {KIND[kind].unit} comptée deux fois, ou
          faute de frappe.
        </div>
      )}

      {/* Lignes commencées mais sans mesure exploitable — écartées à
          l'enregistrement, donc annoncées avant. Muet tant que rien n'est
          valide : sur un relevé prérempli (packing list) toutes les lignes sont
          « incomplètes » à l'ouverture, ce n'est pas une anomalie. */}
      {incompleteCount > 0 && validCount > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {incompleteCount} ligne{incompleteCount > 1 ? "s" : ""} incomplète
          {incompleteCount > 1 ? "s" : ""} ({KIND[kind].aLabel} et {KIND[kind].bLabel} obligatoires)
          {incompleteCount > 1 ? " — elles ne seront pas" : " — elle ne sera pas"} enregistrée
          {incompleteCount > 1 ? "s" : ""}.
        </div>
      )}

      {/* Enregistrement échoué (réseau du parc, contrat clôturé…) : la saisie
          reste à l'écran et le brouillon est conservé — retaper Valider suffit. */}
      {error && (
        <div className="mt-3">
          <FormError hint="Rien n'est perdu — la saisie est conservée. Retaper « Valider » pour réessayer.">
            Enregistrement échoué : {error}
          </FormError>
        </div>
      )}

      {!embedded && (
        <Button
          variant="primary"
          size="lg"
          className="mt-3 w-full"
          onClick={save}
          disabled={saving || validCount === 0}
        >
          {saving
            ? "Enregistrement…"
            : error
              ? `Réessayer (${validCount})`
              : `Valider ${isGirth ? "le billonnage" : "l'étalage"} (${validCount})`}
        </Button>
      )}
      </div>
    </div>
  );
}
