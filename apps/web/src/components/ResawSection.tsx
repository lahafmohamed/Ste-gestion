import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResawOpDTO, SawnLineDTO } from "@ste/shared";
import { resawApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtDec3, fmtPct, todayISO, fmtM3 } from "../lib/format";
import StockLinesEditor, {
  emptyLine,
  lineInfo,
  toLineInputs,
  type LineRow,
} from "./StockLinesEditor";
import Button from "./ui/Button";
import Card, { SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import DateField from "./ui/DateField";
import { EmptyState, FormError, QueryError, Notice } from "./ui/Feedback";
import Input, { Field } from "./ui/Input";
import { SkeletonCard } from "./ui/Skeleton";
import { IconArrowRight, IconPlus } from "./icons";

// Resciage : du bois déjà scié en stock repasse à la scie pour donner des
// sections plus petites. Deux blocs symétriques (consommé / produit), même
// saisie dims + nombre + qualité que les sorties — volume calculé en live.
// Au suivi : « ancienne mesure (recutting out) » et « nouvelle mesure
// (recutting in) ».

function linesSummary(lines: SawnLineDTO[]) {
  const bySize = new Map<string, number>();
  for (const l of lines) bySize.set(l.sizeCode, (bySize.get(l.sizeCode) ?? 0) + Number(l.volumeM3));
  return [...bySize.entries()]
    .map(([code, m3]) => `${code} ${fmtDec3(m3)}`)
    .join(" · ");
}

// Resciage : stock → stock, sans contrat (le bois rescié revient au stock
// général, quel que soit le contrat qui l'a produit).
export default function ResawSection({ stockByCode }: { stockByCode: Map<string, number> }) {
  const can = useCan();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [consumedRows, setConsumedRows] = useState<LineRow[]>([emptyLine()]);
  const [producedRows, setProducedRows] = useState<LineRow[]>([emptyLine()]);
  const [toDelete, setToDelete] = useState<ResawOpDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ops = useQuery({
    queryKey: ["resaws", "all"],
    queryFn: () => resawApi.list(),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["resaws"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }

  const createMut = useMutation({
    mutationFn: resawApi.create,
    onSuccess: () => {
      invalidate();
      setConsumedRows([emptyLine()]);
      setProducedRows([emptyLine()]);
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

  const consumedInfos = consumedRows.map(lineInfo).filter((x) => x !== null);
  const producedInfos = producedRows.map(lineInfo).filter((x) => x !== null);
  const inM3 = consumedInfos.reduce((s, x) => s + x!.volume, 0);
  const outM3 = producedInfos.reduce((s, x) => s + x!.volume, 0);
  const lossM3 = inM3 - outM3; // perte de trait de scie (normale, ≥ 0)

  // Stock par taille → alerte si on consomme plus qu'il n'y en a.
  const consumedByCode = new Map<string, number>();
  for (const x of consumedInfos) {
    consumedByCode.set(x!.size.code, (consumedByCode.get(x!.size.code) ?? 0) + x!.volume);
  }
  const overStock = [...consumedByCode.entries()].filter(
    ([code, v]) => v > (stockByCode.get(code) ?? 0) + 1e-6
  );

  function save() {
    const consumed = toLineInputs(consumedRows);
    const produced = toLineInputs(producedRows);
    if (consumed.length === 0 || produced.length === 0) return;
    createMut.mutate({
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
          can("stock.create") && (
            <Button size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? "Fermer" : <><IconPlus width={16} height={16} className="-ml-0.5" />Resciage</>}
            </Button>
          )
        }
      >
        Resciage
      </SectionHeading>

      {open && (
        <Card className="mb-4">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Date">
              <DateField value={date} max={todayISO()} onChange={setDate} />
            </Field>
            <Field label="Note">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="RESCIAGE 6X4…"
              />
            </Field>
          </div>

          <h3 className="mb-1 text-sm font-semibold text-brand-900">
            Bois consommé <span className="font-normal text-brand-600">(pris du stock)</span>
          </h3>
          <StockLinesEditor rows={consumedRows} setRows={setConsumedRows} />

          <h3 className="mb-1 mt-5 text-sm font-semibold text-brand-900">
            Bois produit <span className="font-normal text-brand-600">(sections plus petites)</span>
          </h3>
          <StockLinesEditor rows={producedRows} setRows={setProducedRows} />

          {overStock.length > 0 && (
            <Notice tone="warn" className="mt-3">
              Consommé au-delà du stock :{" "}
              {overStock
                .map(
                  ([code, v]) =>
                    `${code} (${fmtM3(v)} demandés, ${fmtM3(stockByCode.get(code) ?? 0)} en stock)`
                )
                .join(", ")}
              . Vérifier les tailles saisies.
            </Notice>
          )}
          {outM3 > inM3 + 1e-6 && (
            <Notice tone="danger" className="mt-3">
              Le volume produit dépasse le volume consommé : un resciage ne crée pas de bois.
              Vérifier les dimensions saisies.
            </Notice>
          )}

          {(inM3 > 0 || outM3 > 0) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-brand-50 px-3 py-2 text-sm tabular-nums">
              <span className="text-brand-600">
                Consommé {fmtM3(inM3)}, produit {fmtM3(outM3)}
              </span>
              <span className="font-medium text-brand-800">
                Perte {fmtM3(Math.max(lossM3, 0))}
                {inM3 > 0 && ` (${fmtPct((Math.max(lossM3, 0) / inM3) * 100, 1)})`}
              </span>
            </div>
          )}

          {error && (
            <div className="mt-3">
              <FormError>{error}</FormError>
            </div>
          )}

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

      {ops.isLoading && <SkeletonCard lines={1} />}
      {ops.isError && (
        <QueryError error={ops.error} onRetry={() => ops.refetch()}>
          Impossible de charger les resciages
        </QueryError>
      )}
      {ops.data?.length === 0 && !open && (
        <EmptyState>
          Aucun resciage. Un resciage repasse du bois en stock à la scie pour en tirer des sections
          plus petites.
        </EmptyState>
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
                      <span className="tabular-nums text-brand-600">
                        · {fmtM3(inTotal)} rescié en {fmtM3(outTotal)}
                      </span>
                      {o.note && <span className="ml-1 text-brand-600">· {o.note}</span>}
                    </div>
                    {/* Flèche SVG (pas le glyphe « → ») ; le lecteur d'écran entend « donne ». */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm tabular-nums text-brand-600">
                      <span>{linesSummary(o.consumed)}</span>
                      <IconArrowRight width={14} height={14} className="shrink-0 text-brand-500" />
                      <span className="sr-only">donne</span>
                      <span>{linesSummary(o.produced)}</span>
                    </div>
                  </div>
                  {can("stock.delete") && (
                    <Button size="sm" variant="ghost-danger" onClick={() => setToDelete(o)}>
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
        title="Supprimer ce resciage ?"
        confirmLabel="Supprimer"
        pending={removeMut.isPending}
        onConfirm={() => toDelete && removeMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      >
        Le stock des tailles concernées sera recalculé (le bois consommé revient, le bois produit
        repart).
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
