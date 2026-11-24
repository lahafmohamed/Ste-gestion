import { useState } from "react";
import type { ReactNode } from "react";
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
import Badge, { SIZE_GROUP_TONE } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { BackLink, Kpi, KpiStrip } from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { FormError, QueryError } from "../components/ui/Feedback";
import { SkeletonLine, SkeletonList } from "../components/ui/Skeleton";
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
      // Mêmes clés qu'à la création (ProductionSection) : sans stock / trucks /
      // summary, le stock général et l'avancement des camions gardaient la
      // session supprimée jusqu'au rechargement.
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["cutting"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
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
          <h1 className="text-balance text-title font-semibold tracking-tight text-brand-900">
            Débitage du {new Date(r.producedAt).toLocaleDateString("fr-FR")}
          </h1>
          {/* La note (« DEBITE TECK… ») nomme la feuille : elle figurait sur la
              liste mais disparaissait de la fiche. */}
          {r.note && <p className="mt-1 text-pretty text-sm text-brand-600">{r.note}</p>}
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

      {/* Chiffres-clés en bande (même motif que Stock) plutôt qu'une pastille
          noire peinte à la main : le volume, le nombre et le rendement se
          lisent d'un coup d'œil, debout devant la tablette. */}
      <KpiStrip cols={3} className="mt-4">
        <Kpi bare label="Volume débité" value={<span className="tabular-nums">{fmtM3(total)}</span>} />
        <Kpi
          bare
          label="Pièces"
          value={<span className="tabular-nums">{fmtInt(runPieceCount(r))}</span>}
          hint={`${r.lines.length} ligne${r.lines.length > 1 ? "s" : ""}`}
        />
        <Kpi
          bare
          tone={rendement !== null ? "parc" : "default"}
          label="Rendement"
          value={
            trucksQ.isLoading ? (
              <SkeletonLine className="mt-2 h-6 w-20" />
            ) : rendement !== null ? (
              <span className="tabular-nums">{fmtPct(rendement)}</span>
            ) : (
              <span className="text-brand-500">—</span>
            )
          }
          hint={
            rendement !== null
              ? `sur ${fmtM3(girthLinked)} de billons${
                  sawnBillons.length > 0 ? ` (${sawnBillons.length} billons)` : ""
                }`
              : trucksQ.isLoading
                ? undefined
                : "aucun camion lié"
          }
        />
      </KpiStrip>

      {/* Répartition de la session : une fiche à rangées libellées plutôt que
          trois lignes de pastilles en vrac sous la bande de chiffres. */}
      <Card pad="none" className="mt-3 divide-y divide-brand-100 px-4">
        <SummaryRow label="Tailles">
          {(Object.keys(groups) as SizeGroup[])
            .filter((g) => groups[g] > 0)
            .map((g) => (
              <Badge key={g} size="md" tone={SIZE_GROUP_TONE[g]} className="tabular-nums">
                {SIZE_GROUP_LABELS[g]} {fmtM3(groups[g])}
              </Badge>
            ))}
        </SummaryRow>

        <SummaryRow label="Camions sciés">
          {/* Pas de « aucun camion lié » tant que la liste n'est pas arrivée. */}
          {trucksQ.isLoading ? (
            <SkeletonLine className="w-40" />
          ) : trucksQ.isError ? (
            <QueryError error={trucksQ.error} onRetry={() => trucksQ.refetch()}>
              Impossible de charger les camions
            </QueryError>
          ) : linkedTrucks.length === 0 ? (
            <span className="text-sm text-brand-600">aucun camion lié</span>
          ) : (
            linkedTrucks.map((t) => (
              <Link
                key={t.id}
                to={`/trucks/${t.id}`}
                className="-mx-2 inline-flex min-h-touch items-center gap-2 rounded-lg px-2 text-sm font-medium text-brand-900 underline-offset-2 transition-colors hover:bg-brand-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 active:bg-brand-200"
              >
                {/* B/L d'abord : la session se rapproche des bordereaux, pas des
                    immatriculations. */}
                {truckLabel(t)}
                {t.deliveryNote && (
                  <span className="font-normal text-brand-500">{t.registration}</span>
                )}
              </Link>
            ))
          )}
        </SummaryRow>

        {/* Billons sciés précisés */}
        {sawnBillons.length > 0 && (
          <SummaryRow label="Billons sciés">
            {sawnBillons.map((l) => (
              <Badge key={l.id} tone="parc" title={`${Number(l.volumeM3).toFixed(4)} m³`}>
                {l.externalId ?? `#${l.position}`}
              </Badge>
            ))}
          </SummaryRow>
        )}

        {/* Splits longueur & épaisseur (rapport d'activité) */}
        <SummaryRow label="Longueur">
          <span className="text-sm tabular-nums text-brand-800">
            Long ≥ 6,5 ft {fmtM3(longM3)} ({fmtPct((longM3 / total) * 100, 0)})
            <span className="text-brand-500" aria-hidden>
              {" · "}
            </span>
            court {fmtM3(shortM3)} ({fmtPct((shortM3 / total) * 100, 0)})
          </span>
        </SummaryRow>
        {bands.some((b) => b.m3 > 0) && (
          <SummaryRow label="Épaisseur">
            <span className="text-sm tabular-nums text-brand-800">
              {bands
                .filter((b) => b.m3 > 0)
                .map((b, i) => (
                  <span key={b.key}>
                    {i > 0 && (
                      <span className="text-brand-500" aria-hidden>
                        {" · "}
                      </span>
                    )}
                    {b.label} {fmtM3(b.m3)} ({fmtPct((b.m3 / total) * 100, 0)})
                  </span>
                ))}
            </span>
          </SummaryRow>
        )}
      </Card>

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
                  <td className="py-1.5 pr-3 text-right text-sm tabular-nums text-brand-600">
                    {fmtInt(sec.count)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-sm tabular-nums text-brand-600">
                    {fmtDec3(sec.m3)}
                  </td>
                </tr>
                {sec.lines.map((l) => (
                  // Sur la colonne large, la ligne survolée se suit d'un bout à
                  // l'autre du tableau.
                  <tr
                    key={l.id}
                    className="border-t border-brand-100 transition-colors duration-150 ease-out hover:bg-brand-50"
                  >
                    <Td className="tabular-nums text-brand-500">{l.position}</Td>
                    <Td num>{fmtNum(l.lengthFt)}</Td>
                    <Td num>{fmtNum(l.widthIn)}</Td>
                    <Td num>{fmtNum(l.thicknessIn)}</Td>
                    <Td num>{fmtInt(l.count)}</Td>
                    <Td num>{fmtDec3(l.volumeM3)}</Td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-brand-300 font-semibold">
                <Td colSpan={4}>Total</Td>
                <Td num>{fmtInt(runPieceCount(r))}</Td>
                <Td num>{fmtDec3(total)}</Td>
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
        {/* {" "} explicite : le saut de ligne JSX collait « m³seront ». */}
        {r.lines.length} ligne{r.lines.length > 1 ? "s" : ""}, {fmtM3(total)}{" "}
        seront effacés. Action irréversible.
        {del.isError && (
          <div className="mt-3">
            <FormError>
              Suppression impossible
              {del.error instanceof Error ? ` : ${del.error.message}` : "."}
            </FormError>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Lignes d'une session regroupées par taille, dans l'ordre du classeur (F4). */
/** Rangée libellée de la fiche de répartition (libellé à gauche dès sm). */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 sm:min-h-[3.25rem] sm:flex-row sm:items-center sm:gap-4 sm:py-1">
      <div className="shrink-0 text-sm text-brand-600 sm:w-32">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">{children}</div>
    </div>
  );
}

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
