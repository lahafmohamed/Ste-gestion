import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifySize,
  sawnVolumeM3,
  type ContractSummaryDTO,
  type ResawOpDTO,
  type SawnLineDTO,
} from "@ste/shared";
import { resawApi } from "../lib/api";
import { fmtNum, fmtPct, normalizeDecimal, todayISO } from "../lib/format";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import Button from "./ui/Button";
import Card, { SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import { FormError } from "./ui/Feedback";
import Input, { Field, inputQuietCls } from "./ui/Input";

// Resciage : du bois déjà scié en stock repasse à la scie pour donner des
// sections plus petites. Deux blocs symétriques (consommé / produit), même
// saisie dims + nombre que le débitage — taille et volume calculés en live.

type RowState = { lengthFt: string; widthIn: string; thicknessIn: string; count: string };

const emptyRow = (): RowState => ({ lengthFt: "", widthIn: "", thicknessIn: "", count: "" });

// Mini-libellés des cartes téléphone (< sm) — l'en-tête de colonnes disparaît.
const COL_LABELS = {
  lengthFt: "L (ft)",
  widthIn: "l (in)",
  thicknessIn: "ép (in)",
  count: "Nbr",
} as const;

function rowInfo(r: RowState) {
  const L = Number(r.lengthFt);
  const w = Number(r.widthIn);
  const t = Number(r.thicknessIn);
  const n = Number(r.count);
  if (!r.lengthFt || !r.widthIn || !r.thicknessIn || !r.count) return null;
  if (!(L > 0) || !(w > 0) || !(t > 0) || !Number.isInteger(n) || n < 1) return null;
  return { volume: sawnVolumeM3(L, w, t, n), size: classifySize(w, t), count: n };
}

function toLines(rows: RowState[]) {
  return rows
    .filter((r) => rowInfo(r) !== null)
    .map((r) => ({
      lengthFt: r.lengthFt.trim(),
      widthIn: r.widthIn.trim(),
      thicknessIn: r.thicknessIn.trim(),
      count: Number(r.count),
    }));
}

// Éditeur de lignes partagé par les deux blocs.
function LinesEditor({
  rows,
  setRows,
}: {
  rows: RowState[];
  setRows: React.Dispatch<React.SetStateAction<RowState[]>>;
}) {
  const infos = rows.map(rowInfo);
  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  return (
    <div>
      <div className="overflow-x-auto sm:overflow-visible">
        <div className="sm:min-w-[560px]">
          <div className="hidden items-center gap-1 text-xs text-brand-500 sm:grid sm:grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2.75rem]">
            <span>#</span>
            <span>L (ft)</span>
            <span>l (in)</span>
            <span>ép (in)</span>
            <span>Nbr</span>
            <span>Taille</span>
            <span className="text-right">m³</span>
            <span />
          </div>
          {/* Téléphone (< sm) : carte 2 rangées — même motif que EmpotageEntry,
              ordre DOM inchangé. */}
          {rows.map((r, i) => {
            const info = infos[i];
            return (
              <div
                key={i}
                className="mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_2.75rem] items-center gap-1 border-b border-brand-100 pb-2 sm:grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2.75rem] sm:border-b-0 sm:pb-0"
              >
                <span className="text-xs text-brand-400">{i + 1}</span>
                {(["lengthFt", "widthIn", "thicknessIn", "count"] as const).map((k) => (
                  <div
                    key={k}
                    className={`min-w-0${k === "count" ? " col-start-2 sm:col-auto" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className="mb-0.5 block text-xs text-brand-500 sm:hidden"
                    >
                      {COL_LABELS[k]}
                    </span>
                    <input
                      inputMode="decimal"
                      value={r[k]}
                      aria-label={`${COL_LABELS[k]} ligne ${i + 1}`}
                      // Clavier FR : « 6,5 » doit partir en « 6.5 », sinon l'API rejette la ligne.
                      onChange={(e) => setRow(i, { [k]: normalizeDecimal(e.target.value) })}
                      onKeyDown={
                        k === "count"
                          ? (e) => {
                              if (e.key === "Enter" && i === rows.length - 1) {
                                e.preventDefault();
                                setRows((p) => [...p, emptyRow()]);
                              }
                            }
                          : undefined
                      }
                      className={inputQuietCls}
                    />
                  </div>
                ))}
                {info ? (
                  <Badge tone={SIZE_GROUP_TONE[info.size.group]} className="justify-self-center">
                    {info.size.code}
                  </Badge>
                ) : (
                  <span className="text-center text-xs text-brand-300">—</span>
                )}
                <span className="text-right text-base tabular-nums text-brand-700">
                  <span className="mr-1 text-xs text-brand-400 sm:hidden">m³</span>
                  {info ? info.volume.toFixed(3) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                  className="flex min-h-touch w-full items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="Supprimer la ligne"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setRows((p) => [...p, emptyRow()])}
        className="mt-2 min-h-touch w-full rounded-lg border border-dashed border-brand-300 py-2 text-base font-medium text-brand-600 hover:border-brand-900 hover:text-brand-900 active:bg-brand-100"
      >
        + Ligne
      </button>
    </div>
  );
}

function linesSummary(lines: SawnLineDTO[]) {
  const bySize = new Map<string, number>();
  for (const l of lines) bySize.set(l.sizeCode, (bySize.get(l.sizeCode) ?? 0) + Number(l.volumeM3));
  return [...bySize.entries()]
    .map(([code, m3]) => `${code} ${fmtNum(m3.toFixed(3))}`)
    .join(" · ");
}

export default function ResawSection({
  contractId,
  summary,
}: {
  contractId: string;
  summary: ContractSummaryDTO;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [consumedRows, setConsumedRows] = useState<RowState[]>([emptyRow()]);
  const [producedRows, setProducedRows] = useState<RowState[]>([emptyRow()]);
  const [toDelete, setToDelete] = useState<ResawOpDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ops = useQuery({
    queryKey: ["resaws", contractId],
    queryFn: () => resawApi.listByContract(contractId),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["resaws", contractId] });
    qc.invalidateQueries({ queryKey: ["summary", contractId] });
  }

  const createMut = useMutation({
    mutationFn: resawApi.create,
    onSuccess: () => {
      invalidate();
      setConsumedRows([emptyRow()]);
      setProducedRows([emptyRow()]);
      setNote("");
      setDate("");
      setError(null);
      setOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });
  const removeMut = useMutation({
    mutationFn: resawApi.remove,
    onSuccess: () => {
      invalidate();
      setToDelete(null);
    },
  });

  const consumedInfos = consumedRows.map(rowInfo).filter((x) => x !== null);
  const producedInfos = producedRows.map(rowInfo).filter((x) => x !== null);
  const inM3 = consumedInfos.reduce((s, x) => s + x!.volume, 0);
  const outM3 = producedInfos.reduce((s, x) => s + x!.volume, 0);
  const lossM3 = inM3 - outM3; // perte de trait de scie (normale, ≥ 0)

  // Stock dispo par taille → alerte si on consomme plus qu'il n'y en a.
  const stockByCode = new Map(summary.stockBySize.map((r) => [r.code, Number(r.stockM3)]));
  const consumedByCode = new Map<string, number>();
  for (const x of consumedInfos) {
    consumedByCode.set(x!.size.code, (consumedByCode.get(x!.size.code) ?? 0) + x!.volume);
  }
  const overStock = [...consumedByCode.entries()].filter(
    ([code, v]) => v > (stockByCode.get(code) ?? 0) + 1e-6
  );

  function save() {
    const consumed = toLines(consumedRows);
    const produced = toLines(producedRows);
    if (consumed.length === 0 || produced.length === 0) return;
    createMut.mutate({
      contractId,
      // Midi local : la date seule ne doit pas glisser d'un jour en UTC.
      resawnAt: date ? new Date(`${date}T12:00:00`) : undefined,
      note: note.trim() || undefined,
      consumed,
      produced,
    });
  }

  return (
    <>
      <SectionHeading
        className="mt-6"
        right={
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Fermer" : "+ Resciage"}
          </Button>
        }
      >
        Resciage (stock → sections plus petites)
      </SectionHeading>

      {open && (
        <Card className="mb-4">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Note">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="RESCIAGE 6X4…"
              />
            </Field>
          </div>

          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-500">
            Bois consommé (pris du stock)
          </div>
          <LinesEditor rows={consumedRows} setRows={setConsumedRows} />

          <div className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-brand-500">
            Bois produit (sections plus petites)
          </div>
          <LinesEditor rows={producedRows} setRows={setProducedRows} />

          {overStock.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠ Consommé au-delà du stock :{" "}
              {overStock
                .map(
                  ([code, v]) =>
                    `${code} (${fmtNum(v.toFixed(3))} demandé, ${fmtNum(
                      (stockByCode.get(code) ?? 0).toFixed(3)
                    )} en stock)`
                )
                .join(", ")}
              . Vérifier les tailles saisies.
            </div>
          )}
          {outM3 > inM3 + 1e-6 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Volume produit supérieur au volume consommé — le resciage ne crée pas de matière.
            </div>
          )}

          {(inM3 > 0 || outM3 > 0) && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
              <span className="text-brand-500">
                Consommé {fmtNum(inM3.toFixed(3))} → produit {fmtNum(outM3.toFixed(3))} m³
              </span>
              <span className="font-medium text-brand-700">
                Perte {fmtNum(Math.max(lossM3, 0).toFixed(3))} m³
                {inM3 > 0 && ` (${fmtPct((Math.max(lossM3, 0) / inM3) * 100, 1)})`}
              </span>
            </div>
          )}

          {error && <FormError>{error}</FormError>}

          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            onClick={save}
            disabled={
              createMut.isPending ||
              consumedInfos.length === 0 ||
              producedInfos.length === 0 ||
              outM3 > inM3 + 1e-6
            }
          >
            {createMut.isPending ? "Enregistrement…" : "Valider le resciage"}
          </Button>
        </Card>
      )}

      {(ops.data?.length ?? 0) > 0 && (
        <Card className="mb-4">
          <ul className="divide-y divide-brand-100">
            {ops.data!.map((o) => {
              const inTotal = o.consumed.reduce((s, l) => s + Number(l.volumeM3), 0);
              const outTotal = o.produced.reduce((s, l) => s + Number(l.volumeM3), 0);
              return (
                <li key={o.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0 text-sm">
                    <div className="text-brand-900">
                      <span className="font-medium">
                        {new Date(o.resawnAt).toLocaleDateString("fr-FR")}
                      </span>{" "}
                      <span className="text-brand-500">
                        — {fmtNum(inTotal.toFixed(3))} → {fmtNum(outTotal.toFixed(3))} m³
                      </span>
                      {o.note && <span className="ml-1 text-brand-500">· {o.note}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-brand-500">
                      {linesSummary(o.consumed)} <span className="text-brand-400">→</span>{" "}
                      {linesSummary(o.produced)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost-danger" onClick={() => setToDelete(o)}>
                    Suppr.
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce resciage ?"
        confirmLabel="Supprimer"
        pending={removeMut.isPending}
        onConfirm={() => toDelete && removeMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      >
        Le stock des tailles concernées sera recalculé (le bois consommé revient, le bois produit
        repart).
      </ConfirmDialog>
    </>
  );
}
