import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  runGroupTotals,
  runPieceCount,
  runSawnGirthM3,
  runTotalM3,
  sawnLongShortM3,
  sawnThicknessBands,
  sizeSortIndex,
  SIZE_GROUP_LABELS,
  type SawnLineDTO,
  type SizeGroup,
} from "@ste/shared";
import { downloadFile, productionApi, trucksApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtDec3, fmtInt, fmtNum, fmtPct, fmtM3 } from "../lib/format";
import { truckLabel } from "../lib/trucks";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { BackLink } from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { QueryError } from "../components/ui/Feedback";
import { SkeletonList } from "../components/ui/Skeleton";
import { TableWrap, Td, Th } from "../components/ui/Table";

export default function ProductionRunPage() {
  const { id = "" } = useParams();
  const can = useCan();
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["production", "detail", id],
    queryFn: () => productionApi.get(id),
  });

  // Une session peut n'avoir aucun contrat (camions de contrats différents) :
  // on retombe alors sur tout le parc pour retrouver les immatriculations.
  const contractId = q.data?.contractId;
  const trucksQ = useQuery({
    queryKey: ["trucks", contractId ?? "all"],
    queryFn: () => (contractId ? trucksApi.listByContract(contractId) : trucksApi.list()),
    enabled: !!q.data,
  });

  const del = useMutation({
    mutationFn: () => productionApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["cutting"] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      nav(-1);
    },
  });

  // Confirmation lisible sur tablette (remplace window.confirm).
  const [delOpen, setDelOpen] = useState(false);

  if (q.isLoading)
    return (
      <div className="mx-auto max-w-page-wide px-4 py-6">
        <SkeletonList count={2} />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-page-wide px-4 py-6">
        <BackLink to="/debitage">Débitage</BackLink>
        <div className="mt-3">
          <QueryError error={q.error} onRetry={() => q.refetch()}>
            Impossible d'ouvrir cette session de débitage
          </QueryError>
        </div>
      </div>
    );

  const r = q.data;
  const groups = runGroupTotals(r);
  const total = runTotalM3(r);
  const { longM3, shortM3 } = sawnLongShortM3(r.lines);
  const bands = sawnThicknessBands(r.lines);
  const linkedTrucks = (trucksQ.data ?? []).filter((t) => r.truckIds.includes(t.id));
  // Billons sciés précisés sur la session (c'est le billon qui passe à la scie).
  const sawnBillons = linkedTrucks.flatMap((t) =>
    t.measurements
      .filter((m) => m.context === "YARD_GIRTH")
      .flatMap((m) => m.logs)
      .filter((l) => r.logIds.includes(l.id))
  );
  // Rendement = débité ÷ billons sciés : ceux cochés pour chaque camion, ou le
  // camion entier quand aucun des siens ne l'est (session à deux camions).
  const girthLinked = runSawnGirthM3(linkedTrucks, r.logIds);
  const rendement = girthLinked > 0 ? (total / girthLinked) * 100 : null;

  return (
    <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
      {/* Session sans contrat (camions de plusieurs contrats) : retour au
          débitage — « /contracts/null » menait à une fiche vide. */}
      {r.contractId ? (
        <BackLink to={`/contracts/${r.contractId}`}>Contrat</BackLink>
      ) : (
        <BackLink to="/debitage">Débitage</BackLink>
      )}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-title font-semibold tracking-tight text-brand-900">
            Débitage du {new Date(r.producedAt).toLocaleDateString("fr-FR")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {can("contracts.export") && (
            <Button
              size="sm"
              onClick={() =>
                downloadFile(
                  `/production-runs/${r.id}/export.xlsx`,
                  `debite-${new Date(r.producedAt).toISOString().slice(0, 10)}.xlsx`
                )
              }
            >
              Exporter Excel
            </Button>
          )}
          {can("debitage.delete") && (
            <Button variant="ghost-danger" size="sm" onClick={() => setDelOpen(true)}>
              Supprimer
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-brand-900 px-3 py-1 text-sm font-medium text-white">
          {fmtM3(runTotalM3(r))}
        </span>
        <Badge size="md">{fmtInt(runPieceCount(r))} pièces</Badge>
        {(Object.keys(groups) as SizeGroup[])
          .filter((g) => groups[g] > 0)
          .map((g) => (
            <Badge key={g} size="md">
              {SIZE_GROUP_LABELS[g]} {fmtM3(groups[g])}
            </Badge>
          ))}
      </div>

      {/* Camions sciés + rendement de la session */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-brand-600">Camions sciés :</span>
        {linkedTrucks.length === 0 ? (
          <span className="text-brand-500">aucun camion lié</span>
        ) : (
          linkedTrucks.map((t) => (
            <Link
              key={t.id}
              to={`/trucks/${t.id}`}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-full border border-brand-300 px-3 py-1 text-sm text-brand-700 transition-colors hover:border-brand-900 active:bg-brand-100"
            >
              {/* B/L d'abord : la session se rapproche des bordereaux, pas des
                  immatriculations. */}
              {truckLabel(t)}
              {t.deliveryNote && <span className="text-brand-500">{t.registration}</span>}
            </Link>
          ))
        )}
        {rendement !== null && (
          <Badge tone="parc">
            Rendement {fmtPct(rendement)} ({fmtM3(girthLinked)} de billons
            {sawnBillons.length > 0 ? ` · ${sawnBillons.length} billons` : ""})
          </Badge>
        )}
      </div>

      {/* Billons sciés précisés */}
      {sawnBillons.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-sm text-brand-600">Billons sciés :</span>
          {sawnBillons.map((l) => (
            <Badge key={l.id} tone="parc" title={`${Number(l.volumeM3).toFixed(4)} m³`}>
              {l.externalId ?? `#${l.position}`}
            </Badge>
          ))}
        </div>
      )}

      {/* Splits longueur & épaisseur (rapport d'activité) */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="info">
          Long ≥6,5ft {fmtNum(longM3.toFixed(3))} ({fmtPct((longM3 / total) * 100, 0)}) · court{" "}
          {fmtNum(shortM3.toFixed(3))} ({fmtPct((shortM3 / total) * 100, 0)})
        </Badge>
        {bands
          .filter((b) => b.m3 > 0)
          .map((b) => (
            <Badge key={b.key}>
              {b.label} {fmtNum(b.m3.toFixed(3))} ({fmtPct((b.m3 / total) * 100, 0)})
            </Badge>
          ))}
      </div>

      {/* La taille n'est pas une colonne : « 7"+ », « 1" », « 2" » sont eux-mêmes
          des cotes en pouces, et collés à la colonne ép ils se lisaient comme une
          dimension de plus (« 7 » puis « 7"+ »). Elle devient l'intertitre qui
          porte ses propres totaux — mêmes sections qu'un conteneur empoté. */}
      <Card className="mt-4">
        <TableWrap stickyHeader className="-mx-4 px-4">
          <table className="w-full min-w-[520px] text-base">
            <thead>
              <tr className="text-left text-xs text-brand-500">
                <Th>#</Th>
                <Th right>L (ft)</Th>
                <Th right>l (in)</Th>
                <Th right>ép (in)</Th>
                <Th right>Nbr</Th>
                <Th right>m³</Th>
              </tr>
            </thead>
            {sizeSections(r.lines).map((sec) => (
              <tbody key={sec.code}>
                <tr className="border-t border-brand-200">
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="py-1.5 pr-3 text-left text-sm font-semibold text-brand-900"
                  >
                    {sec.code}
                  </th>
                  <td className="py-1.5 pr-3 text-right text-sm tabular-nums text-brand-500">
                    {fmtInt(sec.count)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-sm tabular-nums text-brand-500">
                    {fmtNum(sec.m3.toFixed(3))}
                  </td>
                </tr>
                {sec.lines.map((l) => (
                  // Sur la colonne large, la ligne survolée se suit d'un bout à
                  // l'autre du tableau.
                  <tr
                    key={l.id}
                    className="border-t border-brand-100 transition-colors duration-150 ease-out hover:bg-brand-50"
                  >
                    <Td className="text-brand-500">{l.position}</Td>
                    <Td num>{fmtNum(l.lengthFt)}</Td>
                    <Td num>{fmtNum(l.widthIn)}</Td>
                    <Td num>{fmtNum(l.thicknessIn)}</Td>
                    <Td num>{l.count}</Td>
                    <Td num>{fmtDec3(l.volumeM3)}</Td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-brand-300 font-semibold">
                <Td colSpan={4}>Total</Td>
                <Td num>{fmtInt(runPieceCount(r))}</Td>
                <Td num>{fmtDec3(runTotalM3(r))}</Td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>

      <ConfirmDialog
        open={delOpen}
        title="Supprimer cette session de débitage ?"
        confirmLabel="Supprimer la session"
        pending={del.isPending}
        onConfirm={() => del.mutate()}
        onCancel={() => setDelOpen(false)}
      >
        {r.lines.length} ligne{r.lines.length > 1 ? "s" : ""}, {fmtM3(total)}
        seront effacés. Action irréversible.
      </ConfirmDialog>
    </div>
  );
}

/** Lignes d'une session regroupées par taille, dans l'ordre du classeur (F4). */
function sizeSections(
  lines: SawnLineDTO[]
): { code: string; count: number; m3: number; lines: SawnLineDTO[] }[] {
  const by = new Map<string, SawnLineDTO[]>();
  for (const l of lines) {
    const g = by.get(l.sizeCode);
    if (g) g.push(l);
    else by.set(l.sizeCode, [l]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => sizeSortIndex(a) - sizeSortIndex(b) || a.localeCompare(b))
    .map(([code, rows]) => ({
      code,
      count: rows.reduce((s, l) => s + l.count, 0),
      m3: rows.reduce((s, l) => s + Number(l.volumeM3), 0),
      lines: rows,
    }));
}
