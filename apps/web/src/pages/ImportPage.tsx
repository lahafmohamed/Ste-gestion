import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  IMPORT_SHEET_LABELS,
  type ContractDTO,
  type ImportApplyDTO,
  type ImportBatchDTO,
  type ImportIssue,
  type ImportPreviewDTO,
  type ImportSheetPreview,
} from "@ste/shared";
import { importsApi } from "../lib/api";
import { fmtDec3, fmtInt, fmtNum } from "../lib/format";
import CuttingResume from "../components/CuttingResume";
import StepLayout from "../components/StepLayout";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { cardCls } from "../components/ui/Card";
import { EmptyState, FormError, Notice, QueryError } from "../components/ui/Feedback";
import { SkeletonLine } from "../components/ui/Skeleton";
import { TableWrap, Td, Th } from "../components/ui/Table";
import { IconChevronDown, IconLock } from "../components/icons";

// Lien d'action dans une ligne de résultat (ouvrir le camion, la session…) :
// cible tactile pleine hauteur, teck comme les autres liens de l'app.
// Soulignés au repos : en teck foncé seul, ils se confondaient avec le texte.
const rowLinkCls =
  "inline-flex min-h-touch items-center rounded-lg px-1.5 text-sm font-medium text-accent-700 " +
  "underline decoration-accent-300 underline-offset-4 transition-colors hover:text-accent-800 " +
  "hover:decoration-accent-600 focus-visible:outline " +
  "focus-visible:outline-2 focus-visible:outline-accent-500";

// Import des classeurs Excel du terrain : le réseau manque en brousse, les
// relevés finissent dans DIAMETRE / GIRTH / DEBITES / EMPOTAGES. Ici on dépose
// le classeur, l'API dit ce qu'elle en ferait (aperçu), on confirme.

// Gabarits vierges (09-2026) : lignes prénumérotées, N° qui repart à 1 à
// chaque FEUIL, colonne PRODUITS sur l'empotage.
const TEMPLATES = [
  { file: "DIAMETRE TECK.xlsx", label: "Étalage Ø" },
  { file: "GIRTH TECK.xlsx", label: "Billonnage (girth)" },
  { file: "DEBITES TECK DU.xlsx", label: "Débitage" },
  { file: "EMPOTAGES DEBITES.xlsx", label: "Empotage" },
];

const EXAMPLES = [
  { file: "DIAMETRE TECK DU 12-05-2026.xlsx", label: "Étalage Ø" },
  { file: "GIRTH TECK DU 12-05-2026.xlsx", label: "Billonnage (girth)" },
  { file: "RESUME DEBITES TECK DU 02-09-2026.xlsx", label: "Débitage (avec colonne GRADE)" },
  { file: "DEBITES TECK DU 15-05-2026.xlsx", label: "Débitage" },
  { file: "EMPOTAGES DEBITES DU 08-05-2026.xlsx", label: "Empotage" },
];

/** Classeurs à télécharger : un libellé, puis des liens tapables (≥ 44px). */
function FileLinks({ title, files }: { title: string; files: { file: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 text-sm">
      <span className="mr-1 text-brand-600">{title}</span>
      {files.map((ex) => (
        <a
          key={ex.file}
          href={`/gabarits/${encodeURIComponent(ex.file)}`}
          download
          title={ex.file}
          className={rowLinkCls}
        >
          {ex.label}
        </a>
      ))}
    </div>
  );
}

const TYPE_TONE: Record<ImportSheetPreview["type"], BadgeTone> = {
  YARD_DIAMETER: "parc",
  YARD_GIRTH: "parc",
  SAWN: "accent",
  CONTAINER: "info",
  UNKNOWN: "brand",
};

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

export default function ImportPage() {
  return (
    <StepLayout title="Import Excel" wide>
      {(c) => <ImportFlow key={c.id} contract={c} />}
    </StepLayout>
  );
}

function ImportFlow({ contract }: { contract: ContractDTO }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ImportApplyDTO | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const previewMut = useMutation({
    mutationFn: (f: { name: string; b64: string }) =>
      importsApi.preview({ contractId: contract.id, filename: f.name, fileBase64: f.b64 }),
    onSuccess: (p) => {
      setPreview(p);
      setChecked(new Set(p.sheets.filter((s) => s.canApply).map((s) => s.name)));
      setResult(null);
    },
  });

  const applyMut = useMutation({
    mutationFn: () =>
      importsApi.apply({
        contractId: contract.id,
        filename: file!.name,
        fileBase64: file!.b64,
        sheets: [...checked],
      }),
    onSuccess: (r) => {
      setResult(r);
      setPreview(null);
      setFile(null);
      for (const key of [
        "trucks",
        "summary",
        "containers",
        "production-runs",
        "stock",
        "contracts",
        "import-history",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  async function pick(f: File | undefined) {
    if (!f) return;
    setFileError(null);
    if (!/\.xlsx$/i.test(f.name)) {
      setFileError(
        "Fichier attendu : classeur Excel .xlsx (enregistrer sous… si le fichier est en .xls).",
      );
      return;
    }
    if (f.size > 6 * 1024 * 1024) {
      setFileError("Classeur trop lourd (plus de 6 Mo).");
      return;
    }
    const b64 = await readAsBase64(f);
    const next = { name: f.name, b64 };
    setFile(next);
    setResult(null);
    previewMut.mutate(next);
  }

  const busy = previewMut.isPending || applyMut.isPending;
  const closed = contract.status === "CLOSED";

  return (
    <div className="space-y-5">
      {/* Bouton grisé sans raison sur un contrat clôturé : dire pourquoi. */}
      {closed && (
        <Notice icon={IconLock}>
          Contrat clôturé : l'import est fermé. Le repasser en « Ouvert » dans les termes du
          contrat pour importer un classeur.
        </Notice>
      )}
      {/* Zone de dépôt — grande cible, marche aussi au doigt (tap = sélecteur). */}
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
        className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
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
        <p className="mt-1 text-sm text-brand-500">
          Une feuille par camion (ou par conteneur). Les camions inconnus sont réceptionnés
          automatiquement d'après le titre et le B/L du classeur.
        </p>
        <Button
          variant="primary"
          className="mt-4"
          disabled={busy || closed}
          onClick={() => inputRef.current?.click()}
        >
          {file ? "Choisir un autre classeur" : "Choisir un classeur…"}
        </Button>
        {fileError && (
          <div className="mx-auto mt-3 max-w-md">
            <FormError>{fileError}</FormError>
          </div>
        )}
        <div className="mt-5 space-y-1 border-t border-brand-100 pt-4">
          <FileLinks title="Classeurs vides :" files={TEMPLATES} />
          <FileLinks title="Exemples remplis :" files={EXAMPLES} />
        </div>
      </div>

      {previewMut.isPending && (
        <div className={`${cardCls} space-y-2.5 p-4`} aria-busy="true">
          <p className="text-sm text-brand-600" aria-live="polite">
            Lecture du classeur…
          </p>
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-3/4" />
        </div>
      )}
      {previewMut.isError && (
        <FormError>Aperçu impossible : {(previewMut.error as Error).message}</FormError>
      )}

      {preview && (
        <PreviewPanel
          preview={preview}
          checked={checked}
          onToggle={(name) =>
            setChecked((s) => {
              const n = new Set(s);
              if (n.has(name)) n.delete(name);
              else n.add(name);
              return n;
            })
          }
          applying={applyMut.isPending}
          applyError={applyMut.isError ? (applyMut.error as Error).message : null}
          onApply={() => applyMut.mutate()}
        />
      )}

      {result && <ResultPanel result={result} contractId={contract.id} />}

      <HistoryPanel contractId={contract.id} />
    </div>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Journal des classeurs déjà enregistrés sur le contrat — le plus récent en
    haut, chaque ligne dépliable sur le détail des feuilles. */
function HistoryPanel({ contractId }: { contractId: string }) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["import-history", contractId],
    queryFn: () => importsApi.history(contractId),
  });

  return (
    <section className={`${cardCls} p-4`}>
      <h2 className="text-base font-semibold tracking-tight text-brand-900">
        Imports enregistrés
      </h2>
      {isPending && (
        <div className="mt-3 space-y-2.5" aria-busy="true">
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/2" />
        </div>
      )}
      {isError && (
        <div className="mt-3">
          <QueryError error={error} onRetry={() => refetch()}>
            Impossible de charger l'historique des imports
          </QueryError>
        </div>
      )}
      {data && data.length === 0 && (
        <div className="mt-3">
          <EmptyState>Aucun classeur importé sur ce contrat pour l'instant.</EmptyState>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="mt-2 divide-y divide-brand-50">
          {data.map((b) => (
            <HistoryRow key={b.id} batch={b} contractId={contractId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({ batch, contractId }: { batch: ImportBatchDTO; contractId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-touch w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 text-left transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 active:bg-brand-100"
        aria-expanded={open}
      >
        <span className="font-medium text-brand-900">{batch.filename}</span>
        <span className="text-sm text-brand-500">{fmtDateTime(batch.createdAt)}</span>
        {batch.user && <span className="text-sm text-brand-500">· {batch.user.name}</span>}
        {/* Colonnes à largeur fixe dès sm : feuilles, lignes et m³ tombent
            l'un sous l'autre d'une ligne à l'autre. */}
        <span className="ml-auto flex flex-wrap items-center gap-x-3 text-sm tabular-nums text-brand-700">
          <span className="sm:w-20 sm:text-right">
            {fmtInt(batch.sheetCount)} feuille{batch.sheetCount > 1 ? "s" : ""}
          </span>
          <span className="sm:w-24 sm:text-right">
            {fmtInt(batch.lineCount)} ligne{batch.lineCount > 1 ? "s" : ""}
          </span>
          <span className="sm:w-28 sm:text-right">{fmtDec3(batch.totalM3)} m³</span>
          {batch.createdTrucks > 0 && (
            <Badge tone="amber">
              {fmtInt(batch.createdTrucks)} camion{batch.createdTrucks > 1 ? "s" : ""} créé
              {batch.createdTrucks > 1 ? "s" : ""}
            </Badge>
          )}
          <IconChevronDown
            width={18}
            height={18}
            className={`shrink-0 text-brand-500 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
          />
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-1 text-sm">
          {batch.applied.map((a) => (
            <li key={a.name} className="flex flex-wrap items-center gap-x-2">
              <Badge tone={TYPE_TONE[a.type]}>{IMPORT_SHEET_LABELS[a.type]}</Badge>
              <span className="text-brand-700">{a.name}</span>
              <span className="tabular-nums text-brand-500">
                · {fmtInt(a.lines)} ligne{a.lines > 1 ? "s" : ""}
              </span>
              {a.volumeM3 && (
                <span className="tabular-nums text-brand-500">· {fmtNum(a.volumeM3)} m³</span>
              )}
              {a.createdTruck && <Badge tone="amber">camion créé</Badge>}
              <AppliedLinks applied={a} contractId={contractId} />
            </li>
          ))}
          <SkippedList skipped={batch.skipped} />
        </ul>
      )}
    </li>
  );
}

function PreviewPanel({
  preview,
  checked,
  onToggle,
  applying,
  applyError,
  onApply,
}: {
  preview: ImportPreviewDTO;
  checked: Set<string>;
  onToggle: (name: string) => void;
  applying: boolean;
  applyError: string | null;
  onApply: () => void;
}) {
  const applicable = preview.sheets.filter((s) => s.canApply);
  const selected = applicable.filter((s) => checked.has(s.name));
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold tracking-tight text-brand-900">
          <span className="break-all">{preview.filename}</span>
          <span className="block text-sm font-normal text-brand-600">
            {preview.sheets.length} feuille{preview.sheets.length > 1 ? "s" : ""} · contrat{" "}
            {preview.contract.code}
            {applicable.length < preview.sheets.length &&
              ` · ${preview.sheets.length - applicable.length} non importable${
                preview.sheets.length - applicable.length > 1 ? "s" : ""
              }`}
          </span>
        </h2>
        <Button
          variant="primary"
          size="lg"
          disabled={applying || selected.length === 0}
          onClick={onApply}
        >
          {applying
            ? "Enregistrement…"
            : `Importer ${selected.length} feuille${selected.length > 1 ? "s" : ""}`}
        </Button>
      </div>
      {/* Erreur sur sa propre ligne : à côté du bouton, elle l'écrasait sur téléphone. */}
      {applyError && (
        <div className="mb-3">
          <FormError>{applyError}</FormError>
        </div>
      )}
      <div className="space-y-3">
        {preview.sheets.map((s) => (
          <SheetCard
            key={s.name}
            sheet={s}
            checked={checked.has(s.name)}
            onToggle={() => onToggle(s.name)}
          />
        ))}
      </div>
    </section>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) return null;
  return (
    // Icône du bandeau (alerte) au lieu de glyphes texte : le ton se lit à la
    // couleur, l'icône la double.
    <ul className="mt-2 space-y-1">
      {issues.map((i, k) => (
        <li key={k}>
          <Notice tone={i.level === "error" ? "danger" : "warn"} className="py-1.5">
            {i.message}
          </Notice>
        </li>
      ))}
    </ul>
  );
}

function SheetCard({
  sheet,
  checked,
  onToggle,
}: {
  sheet: ImportSheetPreview;
  checked: boolean;
  onToggle: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const isLog = sheet.type === "YARD_DIAMETER" || sheet.type === "YARD_GIRTH";
  const isDia = sheet.type === "YARD_DIAMETER";
  const rows = showAll ? sheet.lines : sheet.lines.slice(0, 8);
  const m = sheet.meta;
  const hasPage = sheet.lines.some((l) => l.page !== undefined);
  const hasGrade = !isLog && sheet.lines.some((l) => !!l.grade);

  return (
    <div className={`${cardCls} ${sheet.canApply ? "" : "opacity-90"}`}>
      <div className="flex flex-wrap items-start gap-3 p-4">
        {/* Case élargie à 44px : elle se coche au pouce, pas à la pointe. */}
        <label
          className={`-my-1 -ml-3 flex min-h-touch w-11 items-center justify-center ${
            sheet.canApply ? "cursor-pointer" : "cursor-not-allowed"
          }`}
        >
          <input
            type="checkbox"
            className="h-5 w-5 accent-accent-600"
            checked={checked}
            disabled={!sheet.canApply}
            onChange={onToggle}
            aria-label={`Importer la feuille ${sheet.name}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-brand-900">{sheet.name}</span>
            <Badge tone={TYPE_TONE[sheet.type]}>{IMPORT_SHEET_LABELS[sheet.type]}</Badge>
            {sheet.truckAction === "create" && <Badge tone="amber">camion à créer</Badge>}
            {sheet.truckAction === "match" && sheet.truck && (
              <Link to={`/trucks/${sheet.truck.id}`} className={rowLinkCls}>
                camion {sheet.truck.registration}
                {sheet.truck.deliveryNote ? ` · B/L ${sheet.truck.deliveryNote}` : ""}
              </Link>
            )}
          </div>
          <div className="mt-1 text-sm text-brand-500">
            {[
              m.registration && sheet.truckAction !== "match" && `Camion ${m.registration}`,
              m.deliveryNote && sheet.truckAction !== "match" && `B/L ${m.deliveryNote}`,
              m.declaredFieldM3 && `brousse ${fmtNum(m.declaredFieldM3)} m³`,
              m.containerNo && `Conteneur ${m.containerNo}`,
              m.grade && m.grade,
              m.sealNo && `plomb ${m.sealNo}`,
              m.origin && `provenance ${m.origin}`,
              m.parcel && `parcelle ${m.parcel}`,
              m.date && `date ${m.date.slice(0, 10).split("-").reverse().join("/")}`,
              m.contractCode && `contrat ${m.contractCode}`,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {sheet.type !== "UNKNOWN" && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-brand-900">
              <span>
                <span className="text-brand-500">Lignes</span>{" "}
                <strong className="tabular-nums">{fmtInt(sheet.lines.length)}</strong>
                {!isLog && (
                  <>
                    {" "}
                    <span className="text-brand-500">· pièces</span>{" "}
                    <strong className="tabular-nums">{fmtInt(sheet.pieceCount)}</strong>
                  </>
                )}
              </span>
              <span>
                <span className="text-brand-500">Volume app</span>{" "}
                <strong className="tabular-nums">{fmtNum(sheet.totalM3)} m³</strong>
                {m.excelTotalM3 && (
                  <span className="text-brand-500"> · classeur {fmtNum(m.excelTotalM3)} m³</span>
                )}
              </span>
            </div>
          )}
          <IssueList issues={sheet.issues} />
          {/* Débité / empoté : même résumé que le classeur de pilotage (familles
              de sciage, total, long / court) — on voit ce que la feuille donne
              avant de l'enregistrer. */}
          {!isLog && sheet.lines.length > 0 && (
            <CuttingResume
              className="mt-3 max-w-sm"
              lines={sheet.lines.map((l) => ({
                lengthFt: l.a,
                widthIn: l.b,
                thicknessIn: l.c ?? 0,
                grade: l.grade,
                volumeM3: l.volumeM3,
              }))}
            />
          )}
        </div>
      </div>

      {sheet.lines.length > 0 && (
        <div className="border-t border-brand-100 px-4 py-3">
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="text-brand-500">
                <tr>
                  {hasPage && <Th>Feuil</Th>}
                  <Th>N°</Th>
                  {isLog && <Th>{isDia ? "Bille" : "Billon"}</Th>}
                  {hasGrade && <Th>Produit</Th>}
                  <Th right>{isLog ? (isDia ? "L" : "L (m)") : "L (ft)"}</Th>
                  <Th right>{isLog ? (isDia ? "Ø" : "Circ (cm)") : "l (in)"}</Th>
                  {!isLog && <Th right>ép. (in)</Th>}
                  {!isLog && <Th right>Nbr</Th>}
                  <Th right>m³ app</Th>
                  <Th right>m³ classeur</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={`${l.page ?? 0}-${l.n}-${i}`} className="border-t border-brand-50">
                    {hasPage && <Td num>{l.page ?? ""}</Td>}
                    <Td num>{l.n ?? <span className="text-brand-500">—</span>}</Td>
                    {isLog && <Td>{l.id ?? <span className="text-brand-500">—</span>}</Td>}
                    {hasGrade && <Td>{l.grade ?? ""}</Td>}
                    <Td num>{fmtNum(l.a)}</Td>
                    <Td num>{fmtNum(l.b)}</Td>
                    {!isLog && <Td num>{l.c ? fmtNum(l.c) : ""}</Td>}
                    {!isLog && <Td num>{l.count ?? ""}</Td>}
                    <Td num>{fmtDec3(l.volumeM3)}</Td>
                    <Td num className="text-brand-500">
                      {l.excelM3 ? fmtDec3(l.excelM3) : ""}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {sheet.lines.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-2 inline-flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 active:bg-brand-200"
            >
              {showAll ? "Réduire" : `Voir les ${sheet.lines.length} lignes`}
              <IconChevronDown
                width={16}
                height={16}
                className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${
                  showAll ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type AppliedSheet = ImportApplyDTO["applied"][number];

/** Où aller voir ce qu'une feuille a créé — partagé par le résultat et l'historique. */
function AppliedLinks({ applied: a, contractId }: { applied: AppliedSheet; contractId: string }) {
  return (
    <>
      {a.truckId && (
        <Link to={`/trucks/${a.truckId}`} className={rowLinkCls}>
          Ouvrir le camion
        </Link>
      )}
      {a.type === "SAWN" && (
        <Link to={`/production-runs/${a.createdId}`} className={rowLinkCls}>
          Ouvrir la session
        </Link>
      )}
      {a.type === "CONTAINER" && (
        <Link to={`/contracts/${contractId}?onglet=empotage`} className={rowLinkCls}>
          Voir les conteneurs
        </Link>
      )}
    </>
  );
}

/** Feuilles écartées : bandeau d'alerte (icône SVG), pas de glyphe dans le texte. */
function SkippedList({ skipped }: { skipped: ImportApplyDTO["skipped"] }) {
  return (
    <>
      {skipped.map((s) => (
        <li key={s.name}>
          <Notice tone="warn" className="py-1.5">
            <span className="font-medium">{s.name}</span> : {s.reason}
          </Notice>
        </li>
      ))}
    </>
  );
}

function ResultPanel({ result, contractId }: { result: ImportApplyDTO; contractId: string }) {
  return (
    <section className={`${cardCls} p-4`}>
      <Notice tone="success">
        <span className="font-medium">
          Import terminé : {result.applied.length} feuille{result.applied.length > 1 ? "s" : ""}{" "}
          enregistrée{result.applied.length > 1 ? "s" : ""}.
        </span>
      </Notice>
      <ul className="mt-3 space-y-1 text-sm">
        {result.applied.map((a) => (
          <li key={a.name} className="flex flex-wrap items-center gap-x-2">
            <Badge tone={TYPE_TONE[a.type]}>{IMPORT_SHEET_LABELS[a.type]}</Badge>
            <span className="text-brand-700">{a.name}</span>
            <span className="tabular-nums text-brand-500">
              · {fmtInt(a.lines)} ligne{a.lines > 1 ? "s" : ""}
            </span>
            {a.createdTruck && <Badge tone="amber">camion créé</Badge>}
            <AppliedLinks applied={a} contractId={contractId} />
          </li>
        ))}
        <SkippedList skipped={result.skipped} />
      </ul>
    </section>
  );
}
