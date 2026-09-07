import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  IMPORT_SHEET_LABELS,
  type ContractDTO,
  type ImportApplyDTO,
  type ImportIssue,
  type ImportPreviewDTO,
  type ImportSheetPreview,
} from "@ste/shared";
import { importsApi } from "../lib/api";
import { fmtInt, fmtNum } from "../lib/format";
import CuttingResume from "../components/CuttingResume";
import StepLayout from "../components/StepLayout";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { FormError } from "../components/ui/Feedback";
import { TableWrap, Td, Th } from "../components/ui/Table";

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

function FileLinks({ files }: { files: { file: string; label: string }[] }) {
  return (
    <>
      {files.map((ex, i) => (
        <span key={ex.file}>
          {i > 0 && " · "}
          <a
            href={`/gabarits/${encodeURIComponent(ex.file)}`}
            download
            className="underline hover:text-brand-700"
          >
            {ex.label}
          </a>
        </span>
      ))}
    </>
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
    <StepLayout
      title="Import Excel"
      subtitle="Déposer un classeur terrain (étalage, billonnage, débitage, empotage) : l'app le lit, montre ce qu'elle va créer, puis enregistre."
      wide
    >
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
        "sawn-inventory",
        "contracts",
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
        <p className="mt-4 text-xs text-brand-400">
          Classeurs vides : <FileLinks files={TEMPLATES} />
        </p>
        <p className="mt-1 text-xs text-brand-400">
          Exemples remplis : <FileLinks files={EXAMPLES} />
        </p>
      </div>

      {previewMut.isPending && <p className="text-sm text-brand-500">Lecture du classeur…</p>}
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
    </div>
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
        <h2 className="text-sm font-semibold text-brand-900">
          {preview.filename} — {preview.sheets.length} feuille{preview.sheets.length > 1 ? "s" : ""}
          {" · "}
          <span className="font-normal text-brand-500">contrat {preview.contract.code}</span>
        </h2>
        <div className="flex items-center gap-3">
          {applyError && <FormError>{applyError}</FormError>}
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
      </div>
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
    <ul className="mt-2 space-y-1">
      {issues.map((i, k) => (
        <li
          key={k}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            i.level === "error"
              ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/70"
              : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70"
          }`}
        >
          {i.level === "error" ? "✕ " : "⚠ "}
          {i.message}
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
    <div className={`rounded-xl bg-white shadow-card ${sheet.canApply ? "" : "opacity-90"}`}>
      <div className="flex flex-wrap items-start gap-3 p-4">
        <label className="flex min-h-touch items-center">
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
              <Link to={`/trucks/${sheet.truck.id}`} className="text-sm text-brand-600 underline">
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
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
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
                  <span className="text-brand-400"> · classeur {fmtNum(m.excelTotalM3)} m³</span>
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
                    <Td num>{l.n}</Td>
                    {isLog && <Td>{l.id ?? <span className="text-brand-300">—</span>}</Td>}
                    {hasGrade && <Td>{l.grade ?? ""}</Td>}
                    <Td num>{fmtNum(l.a)}</Td>
                    <Td num>{fmtNum(l.b)}</Td>
                    {!isLog && <Td num>{l.c ? fmtNum(l.c) : ""}</Td>}
                    {!isLog && <Td num>{l.count ?? ""}</Td>}
                    <Td num>{Number(l.volumeM3).toFixed(3)}</Td>
                    <Td num className="text-brand-400">
                      {l.excelM3 ? Number(l.excelM3).toFixed(3) : ""}
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
              className="mt-2 min-h-touch rounded-lg px-2 text-sm text-brand-500 underline hover:text-brand-900"
            >
              {showAll ? "Réduire" : `Voir les ${sheet.lines.length} lignes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ResultPanel({ result, contractId }: { result: ImportApplyDTO; contractId: string }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-brand-900">
        Import terminé — {result.applied.length} feuille{result.applied.length > 1 ? "s" : ""}{" "}
        enregistrée{result.applied.length > 1 ? "s" : ""}
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {result.applied.map((a) => (
          <li key={a.name} className="flex flex-wrap items-center gap-2">
            <Badge tone={TYPE_TONE[a.type]}>{IMPORT_SHEET_LABELS[a.type]}</Badge>
            <span className="text-brand-700">{a.name}</span>
            <span className="text-brand-500">· {fmtInt(a.lines)} lignes</span>
            {a.createdTruck && <Badge tone="amber">camion créé</Badge>}
            {a.truckId && (
              <Link to={`/trucks/${a.truckId}`} className="underline text-brand-600">
                ouvrir le camion
              </Link>
            )}
            {a.type === "SAWN" && (
              <Link to={`/production-runs/${a.createdId}`} className="underline text-brand-600">
                ouvrir la session
              </Link>
            )}
            {a.type === "CONTAINER" && (
              <Link
                to={`/contracts/${contractId}?onglet=empotage`}
                className="underline text-brand-600"
              >
                voir les conteneurs
              </Link>
            )}
          </li>
        ))}
        {result.skipped.map((s) => (
          <li key={s.name} className="text-amber-800">
            ⚠ {s.name} : {s.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}
