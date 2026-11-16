import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LEDGER_KIND_LABELS,
  STOCK_OUT_KINDS,
  suiviColumnLabel,
  suiviColumnIndex,
  type StockImportPreviewDTO,
  type StockMovementDTO,
  type StockMovementKind,
} from "@ste/shared";
import { stockApi } from "../../lib/api";
import { useCan } from "../../lib/auth";
import { fmtDec3, fmtM3, fmtNum, todayISO } from "../../lib/format";
import StockLinesEditor, { emptyLine, lineInfo, toLineInputs, type LineRow } from "../StockLinesEditor";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Card, { SectionHeading } from "../ui/Card";
import Chip from "../ui/Chip";
import ConfirmDialog from "../ui/ConfirmDialog";
import DateField from "../ui/DateField";
import { EmptyState, FormError, Notice, QueryError } from "../ui/Feedback";
import Input, { Field } from "../ui/Input";
import { SkeletonCard } from "../ui/Skeleton";
import { IconPlus } from "../icons";

// Ce que le stock ne voit pas passer ailleurs : l'inventaire (remise à zéro
// datée) et les sorties hors empotage — livraison (commande), vente, séchoir,
// menuiserie, rejets. Saisie pièce par pièce, ou import d'un classeur au
// format STOCK (le tableau du client, l'export de la plateforme, un DEBITES).

type Mode = null | "inventaire" | "sortie" | "import";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Lecture du fichier impossible"));
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.readAsDataURL(file);
  });
}

/** "7x5x3:B" → « 7 ft · 5×3 B ». */
function keyLabel(key: string) {
  const [dims, q] = key.split(":");
  const [L, w, t] = dims.split("x");
  return `${fmtNum(L)} ft · ${fmtNum(w)}×${fmtNum(t)} ${q === "A" ? "A grade" : q}`;
}

/** Midi local : la date seule ne doit pas glisser d'un jour en UTC. */
const noon = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : undefined);

function productsSummary(byKey: Map<string, number>) {
  return [...byKey.entries()]
    .sort((a, b) => suiviColumnIndex(a[0]) - suiviColumnIndex(b[0]))
    .map(([k, m3]) => `${suiviColumnLabel(k)} ${fmtDec3(m3)}`)
    .join(" · ");
}

function movementProducts(m: StockMovementDTO) {
  const by = new Map<string, number>();
  for (const l of m.lines) {
    // suiviKey non stocké sur la ligne : recalculé comme au serveur.
    const key = lineInfo({
      lengthFt: l.lengthFt,
      widthIn: l.widthIn,
      thicknessIn: l.thicknessIn,
      count: String(l.count),
      quality: l.quality,
    })?.suiviKey;
    if (key) by.set(key, (by.get(key) ?? 0) + Number(l.volumeM3));
  }
  return productsSummary(by);
}

export default function StockMovementsTab() {
  const can = useCan();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<StockMovementDTO | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const movements = useQuery({
    queryKey: ["stock", "movements"],
    queryFn: () => stockApi.movements(),
  });

  const canInventory = can("stock.edit");
  const canOut = can("stock.create");

  const removeMut = useMutation({
    mutationFn: stockApi.deleteMovement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      setToDelete(null);
    },
  });

  function finished(m: StockMovementDTO) {
    qc.invalidateQueries({ queryKey: ["stock"] });
    setMode(null);
    setDone(
      `${LEDGER_KIND_LABELS[m.kind]} du ${new Date(m.movedAt).toLocaleDateString("fr-FR")} enregistré : ${fmtNum(m.pieces)} pièces, ${fmtM3(m.totalM3)}.`
    );
  }

  return (
    <>
      <SectionHeading
        right={
          <div className="flex flex-wrap justify-end gap-2">
            {canOut && (
              <Button size="sm" onClick={() => setMode(mode === "sortie" ? null : "sortie")}>
                <IconPlus width={16} height={16} className="-ml-0.5" />
                Sortie
              </Button>
            )}
            {canInventory && (
              <Button size="sm" onClick={() => setMode(mode === "inventaire" ? null : "inventaire")}>
                <IconPlus width={16} height={16} className="-ml-0.5" />
                Inventaire
              </Button>
            )}
            {(canOut || canInventory) && (
              <Button size="sm" onClick={() => setMode(mode === "import" ? null : "import")}>
                Importer un classeur
              </Button>
            )}
          </div>
        }
      >
        Inventaire et sorties
      </SectionHeading>

      {done && (
        <Notice tone="success" className="mb-4">
          {done}
        </Notice>
      )}

      {(mode === "inventaire" || mode === "sortie") && (
        <MovementForm
          key={mode}
          inventory={mode === "inventaire"}
          onCancel={() => setMode(null)}
          onSaved={finished}
        />
      )}
      {mode === "import" && (
        <ImportForm
          canInventory={canInventory}
          canOut={canOut}
          onCancel={() => setMode(null)}
          onSaved={finished}
        />
      )}

      {movements.isLoading && <SkeletonCard lines={2} />}
      {movements.isError && (
        <QueryError error={movements.error} onRetry={() => movements.refetch()}>
          Impossible de charger les mouvements
        </QueryError>
      )}
      {movements.data?.length === 0 && mode === null && (
        <EmptyState>
          Aucun inventaire ni sortie saisi. Le sciage, le resciage et l'empotage arrivent seuls au
          suivi ; ici se saisissent l'inventaire de départ et les livraisons, ventes, bois pour
          séchoir, menuiserie et rejets.
        </EmptyState>
      )}
      {(movements.data?.length ?? 0) > 0 && (
        <Card>
          <ul className="divide-y divide-brand-100">
            {movements.data!.map((m) => {
              const isInv = m.kind === "INVENTAIRE";
              const canDelete = isInv ? canInventory : can("stock.delete");
              return (
                <li key={m.id} className="flex items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-brand-900">
                      <span className="font-medium tabular-nums">
                        {new Date(m.movedAt).toLocaleDateString("fr-FR")}
                      </span>
                      <Badge tone={isInv ? "info" : "amber"}>{LEDGER_KIND_LABELS[m.kind]}</Badge>
                      {m.reference && <span className="text-brand-700">{m.reference}</span>}
                      <span className="tabular-nums text-brand-600">
                        {fmtNum(m.pieces)} pièces · {fmtM3(m.totalM3)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm tabular-nums text-brand-600">
                      {movementProducts(m)}
                    </div>
                    {m.note && <div className="mt-0.5 text-sm text-brand-500">{m.note}</div>}
                  </div>
                  {canDelete && (
                    <Button size="sm" variant="ghost-danger" onClick={() => setToDelete(m)}>
                      Supprimer
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={
          toDelete?.kind === "INVENTAIRE" ? "Supprimer cet inventaire ?" : "Supprimer cette sortie ?"
        }
        confirmLabel="Supprimer"
        pending={removeMut.isPending}
        onConfirm={() => toDelete && removeMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      >
        {toDelete?.kind === "INVENTAIRE"
          ? "Le stock repartira de l'inventaire précédent (ou de zéro s'il n'y en a pas) et recomptera les mouvements depuis."
          : "Les pièces reviennent au stock."}
        {removeMut.isError && (
          <div className="mt-3">
            <FormError>
              Suppression impossible
              {removeMut.error instanceof Error ? ` : ${removeMut.error.message}` : "."}
            </FormError>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

// ── Saisie d'un inventaire ou d'une sortie ──

function MovementForm({
  inventory,
  onCancel,
  onSaved,
}: {
  inventory: boolean;
  onCancel: () => void;
  onSaved: (m: StockMovementDTO) => void;
}) {
  const [kind, setKind] = useState<StockMovementKind>(inventory ? "INVENTAIRE" : "LIVRAISON");
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<LineRow[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const stock = useQuery({
    queryKey: ["stock", "inventory"],
    queryFn: () => stockApi.sawnInventory(),
  });

  const infos = rows.map(lineInfo).filter((x) => x !== null);
  const total = infos.reduce((s, x) => s + x!.volume, 0);
  const pieces = infos.reduce((s, x) => s + x!.count, 0);

  // Sortie au-delà du stock libre : on prévient sans bloquer (le terrain peut
  // être en avance sur la saisie).
  const over = useMemo(() => {
    if (inventory) return [];
    const avail = new Map((stock.data ?? []).map((r) => [r.key, r.availableCount]));
    const asked = new Map<string, number>();
    for (const x of infos) asked.set(x!.key, (asked.get(x!.key) ?? 0) + x!.count);
    return [...asked.entries()].filter(([k, n]) => n > (avail.get(k) ?? 0));
  }, [inventory, infos, stock.data]);

  const currentM3 = (stock.data ?? []).reduce((s, r) => s + Number(r.stockM3), 0);

  const mut = useMutation({
    mutationFn: stockApi.createMovement,
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  function save() {
    const lines = toLineInputs(rows);
    if (lines.length === 0) return;
    setError(null);
    mut.mutate({
      kind,
      movedAt: noon(date),
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      lines,
    });
  }

  return (
    <Card className="mb-4">
      <h3 className="mb-3 text-base font-semibold text-brand-900">
        {inventory ? "Nouvel inventaire" : "Nouvelle sortie de stock"}
      </h3>
      {inventory ? (
        <Notice tone="warn" className="mb-3">
          L'inventaire remplace le stock calculé : à partir de sa date, le stock repart des pièces
          comptées ici, et les mouvements antérieurs ne comptent plus. Saisir toutes les
          dimensions présentes au parc.
        </Notice>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Type de sortie">
          {STOCK_OUT_KINDS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
              {LEDGER_KIND_LABELS[k]}
            </Chip>
          ))}
        </div>
      )}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={inventory ? "Date du comptage" : "Date"}>
          <DateField value={date} max={todayISO()} onChange={setDate} />
        </Field>
        <Field label={kind === "LIVRAISON" ? "N° de commande" : kind === "VENTE" ? "Client / facture" : "Référence"}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>

      <StockLinesEditor rows={rows} setRows={setRows} />

      {over.length > 0 && (
        <Notice tone="warn" className="mt-3">
          Plus de pièces que le stock libre sur {over.length} dimension
          {over.length > 1 ? "s" : ""} :{" "}
          {over
            .slice(0, 5)
            .map(([k]) => keyLabel(k))
            .join(", ")}
          . Le stock passera en négatif.
        </Notice>
      )}

      {pieces > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-brand-50 px-3 py-2 text-sm tabular-nums">
          <span className="text-brand-600">
            {fmtNum(pieces)} pièces · {fmtM3(total)}
          </span>
          {inventory && stock.data && (
            <span className="font-medium text-brand-800">
              Stock calculé aujourd'hui {fmtM3(currentM3)} · écart {fmtDec3(total - currentM3)} m³
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="lg" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={save}
          disabled={mut.isPending || infos.length === 0 || !date}
        >
          {mut.isPending
            ? "Enregistrement…"
            : inventory
              ? "Enregistrer l'inventaire"
              : "Enregistrer la sortie"}
        </Button>
      </div>
    </Card>
  );
}

// ── Import d'un classeur au format STOCK ──

function ImportForm({
  canInventory,
  canOut,
  onCancel,
  onSaved,
}: {
  canInventory: boolean;
  canOut: boolean;
  onCancel: () => void;
  onSaved: (m: StockMovementDTO) => void;
}) {
  const kinds: StockMovementKind[] = [
    ...(canInventory ? (["INVENTAIRE"] as const) : []),
    ...(canOut ? STOCK_OUT_KINDS : []),
  ];
  const [kind, setKind] = useState<StockMovementKind>(kinds[0]);
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null);
  const [preview, setPreview] = useState<StockImportPreviewDTO | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewMut = useMutation({
    mutationFn: stockApi.importPreview,
    onSuccess: (p) => {
      setPreview(p);
      setChosen(new Set(p.sheets.filter((s) => s.usable).map((s) => s.name)));
      const d = p.sheets.find((s) => s.usable && s.date)?.date;
      setDate(d ? d.slice(0, 10) : todayISO());
    },
    onError: (e: Error) => setError(e.message),
  });
  const applyMut = useMutation({
    mutationFn: stockApi.importApply,
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setPreview(null);
    const b64 = await readAsBase64(f);
    setFile({ name: f.name, b64 });
    previewMut.mutate({ filename: f.name, fileBase64: b64, kind });
  }

  function changeKind(k: StockMovementKind) {
    setKind(k);
    // Le sens des nombres négatifs dépend du type : on relit le classeur.
    if (file) previewMut.mutate({ filename: file.name, fileBase64: file.b64, kind: k });
  }

  const selected = preview?.sheets.filter((s) => chosen.has(s.name)) ?? [];
  const selPieces = selected.reduce((s, x) => s + x.pieceCount, 0);
  const selM3 = selected.reduce((s, x) => s + Number(x.totalM3), 0);
  const busy = previewMut.isPending || applyMut.isPending;

  return (
    <Card className="mb-4">
      <h3 className="mb-1 text-base font-semibold text-brand-900">Importer un classeur</h3>
      <p className="mb-3 text-sm text-brand-600">
        Tableau N° · PRODUITS · LONGUEUR (FEET) · LARGEUR (INCH) · EPAISSEUR (INCH) · NBR DELIGNE :
        le classeur STOCK, l'export STOCK de la plateforme ou un DEBITES. La colonne PRODUITS donne
        la qualité (A GRADE, 5X3 C…). Les feuilles cochées forment un seul mouvement.
      </p>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Le classeur est">
        {kinds.map((k) => (
          <Chip key={k} selected={kind === k} onClick={() => changeKind(k)} disabled={busy}>
            {LEDGER_KIND_LABELS[k]}
          </Chip>
        ))}
      </div>
      {kind === "INVENTAIRE" && (
        <Notice tone="warn" className="mb-3">
          Importé comme inventaire, le classeur remplace le stock à sa date. Les nombres négatifs
          d'une même dimension se compensent, comme dans le tableau STOCK.
        </Notice>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void pick(e.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
          dragging ? "border-accent-500 bg-accent-50" : "border-brand-300 bg-white"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="text-base font-medium text-brand-900">
          {file ? file.name : "Glisser le classeur ici"}
        </p>
        <Button size="sm" className="mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>
          {file ? "Choisir un autre fichier" : "Choisir un fichier .xlsx"}
        </Button>
      </div>

      {previewMut.isPending && <p className="mt-3 text-sm text-brand-600">Lecture du classeur…</p>}

      {preview && (
        <div className="mt-4">
          <ul className="divide-y divide-brand-100 rounded-lg ring-1 ring-brand-100">
            {preview.sheets.map((s) => {
              const issues = s.issues.slice(0, 4);
              return (
                <li key={s.name} className="px-3 py-2">
                  <label className="flex min-h-touch items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-accent-600"
                      checked={chosen.has(s.name)}
                      disabled={!s.usable || busy}
                      onChange={(e) =>
                        setChosen((p) => {
                          const next = new Set(p);
                          if (e.target.checked) next.add(s.name);
                          else next.delete(s.name);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-brand-900">{s.name}</span>
                      {s.usable && (
                        <span className="ml-2 tabular-nums text-brand-600">
                          {fmtNum(s.lineCount)} dimensions · {fmtNum(s.pieceCount)} pièces ·{" "}
                          {fmtM3(s.totalM3)}
                        </span>
                      )}
                      {s.usable && (
                        <span className="mt-0.5 block tabular-nums text-brand-600">
                          {productsSummary(
                            new Map(Object.entries(s.byColumn).map(([k, v]) => [k, Number(v)]))
                          )}
                        </span>
                      )}
                      {issues.map((i, n) => (
                        <span
                          key={n}
                          className={`mt-0.5 block ${i.level === "error" ? "text-red-600" : "text-amber-700"}`}
                        >
                          {i.message}
                        </span>
                      ))}
                      {s.issues.length > issues.length && (
                        <span className="mt-0.5 block text-brand-500">
                          … et {s.issues.length - issues.length} autre
                          {s.issues.length - issues.length > 1 ? "s" : ""} remarque
                          {s.issues.length - issues.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={kind === "INVENTAIRE" ? "Date du comptage" : "Date"}>
              <DateField value={date} max={todayISO()} onChange={setDate} />
            </Field>
            <Field label="Référence">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
            </Field>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="lg" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={busy || !file || selected.length === 0 || !date}
          onClick={() =>
            file &&
            applyMut.mutate({
              filename: file.name,
              fileBase64: file.b64,
              kind,
              sheets: [...chosen],
              movedAt: noon(date),
              reference: reference.trim() || undefined,
            })
          }
        >
          {applyMut.isPending
            ? "Enregistrement…"
            : selected.length
              ? `Enregistrer : ${fmtNum(selPieces)} pièces, ${fmtM3(selM3)}`
              : "Choisir au moins une feuille"}
        </Button>
      </div>
    </Card>
  );
}
