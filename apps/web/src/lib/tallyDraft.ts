// ── Brouillon localStorage des saisies TallyEntry ─────────────────────
// La saisie au parc dure de longues minutes sur tablette : un écran verrouillé
// ou un onglet tué ne doit pas coûter 275 lignes. Sauvé à chaque frappe,
// restauré à l'ouverture, purgé par le parent après enregistrement réussi.

// `id` : clé React stable. Avec l'index, supprimer la ligne 3 décalait toutes
// les suivantes — React réutilisait les <input> et le focus atterrissait sur la
// mauvaise ligne au milieu d'un relevé.
export type RowState = { id: string; externalId: string; a: string; b: string };

let rowSeq = 0;
export const nextRowId = () => `r${++rowSeq}`;

export const emptyRow = (externalId = ""): RowState => ({
  id: nextRowId(),
  externalId,
  a: "",
  b: "",
});

export function rowEmpty(r: RowState) {
  return !r.externalId.trim() && !r.a.trim() && !r.b.trim();
}

export function loadDraft(key: string | undefined): RowState[] | null {
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

export function saveDraft(key: string, rows: RowState[]) {
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
