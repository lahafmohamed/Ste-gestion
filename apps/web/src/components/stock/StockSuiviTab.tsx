import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LEDGER_KIND_LABELS, LEDGER_KIND_SIGN, type LedgerKind } from "@ste/shared";
import { stockApi } from "../../lib/api";
import { fmtDec3, fmtNum } from "../../lib/format";
import Card from "../ui/Card";
import Chip from "../ui/Chip";
import { EmptyState, Notice, QueryError } from "../ui/Feedback";
import { SkeletonList } from "../ui/Skeleton";
import { TableWrap } from "../ui/Table";

// Suivi par épaisseur : le classeur SUIVI du client, calculé. Une ligne par
// mouvement (inventaire, sciage, empotage, sorties, resciage) depuis le
// dernier inventaire, ventilée en m³ par produit ; le pied = le stock.

const FROZEN_EDGE =
  "[&_td:first-child]:shadow-[inset_-1px_0_0_theme(colors.brand.200)] " +
  "[&_th:first-child]:shadow-[inset_-1px_0_0_theme(colors.brand.200)] " +
  "sm:[&_td:first-child]:shadow-none sm:[&_th:first-child]:shadow-none";

function cell(v: string | number | undefined): ReactNode {
  const n = Number(v ?? 0);
  if (Math.abs(n) < 0.0005) return <span className="text-brand-500">—</span>;
  return fmtDec3(n);
}

type Filter = "all" | "in" | "out";

export default function StockSuiviTab() {
  const ledger = useQuery({ queryKey: ["stock", "ledger"], queryFn: () => stockApi.ledger() });
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const all = ledger.data?.rows ?? [];
    if (filter === "all") return all;
    return all.filter((r) =>
      filter === "in" ? LEDGER_KIND_SIGN[r.kind] > 0 : LEDGER_KIND_SIGN[r.kind] < 0
    );
  }, [ledger.data, filter]);

  if (ledger.isError) {
    return (
      <QueryError error={ledger.error} onRetry={() => ledger.refetch()}>
        Impossible de charger le suivi
      </QueryError>
    );
  }
  const d = ledger.data;
  if (!d) return <SkeletonList count={4} />;

  // Cumul par type : la relecture que fait le bureau en fin de mois.
  const byKind = new Map<LedgerKind, number>();
  for (const r of d.rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + Number(r.volumeM3));

  return (
    <>
      {!d.inventory && (
        <Notice tone="warn" className="mb-4">
          Aucun inventaire : le suivi reprend tout l'historique. Un inventaire saisi ou importé
          devient la première ligne et remet le compteur au stock réel.
        </Notice>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Tous"],
            ["in", "Entrées"],
            ["out", "Sorties"],
          ] as const
        ).map(([k, label]) => (
          <Chip key={k} selected={filter === k} onClick={() => setFilter(k)}>
            {label}
          </Chip>
        ))}
        <span className="ml-auto text-sm text-brand-600">
          {fmtNum(d.rows.length)} mouvement{d.rows.length > 1 ? "s" : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState>Aucun mouvement à afficher.</EmptyState>
      ) : (
        <Card pad="sm">
          <TableWrap stickyFirstCol className={FROZEN_EDGE}>
            <table className="w-full text-sm" style={{ minWidth: `${28 + d.columns.length * 5.5}rem` }}>
              <thead>
                <tr className="whitespace-nowrap text-left text-xs text-brand-500">
                  <th className="py-1 pr-3 font-normal">Date</th>
                  <th className="py-1 pr-3 font-normal">Désignation</th>
                  <th className="py-1 pr-3 font-normal">N° CBG / réf.</th>
                  <th className="py-1 pr-3 text-right font-normal">Vol. m³</th>
                  {d.columns.map((c) => (
                    <th key={c.key} className="py-1 pr-3 text-right font-normal">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const out = LEDGER_KIND_SIGN[r.kind] < 0;
                  const isInv = r.kind === "INVENTAIRE";
                  return (
                    <tr
                      key={r.key}
                      className={`border-t border-brand-100 ${isInv ? "font-medium" : ""}`}
                    >
                      <td className="whitespace-nowrap py-1 pr-3 tabular-nums text-brand-700">
                        {new Date(r.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="whitespace-nowrap py-1 pr-3 text-brand-900">
                        {LEDGER_KIND_LABELS[r.kind]}
                      </td>
                      <td className="max-w-[12rem] truncate py-1 pr-3 text-brand-600" title={r.note ?? undefined}>
                        {r.reference ?? (r.note ? <span className="text-brand-500">{r.note}</span> : "—")}
                      </td>
                      <td
                        className={`py-1 pr-3 text-right font-medium tabular-nums ${
                          out ? "text-amber-700" : "text-brand-900"
                        }`}
                      >
                        {fmtDec3(r.volumeM3)}
                      </td>
                      {d.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`py-1 pr-3 text-right tabular-nums ${
                            out ? "text-amber-700" : "text-brand-700"
                          }`}
                        >
                          {cell(r.byColumn[c.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              {filter === "all" && (
                <tfoot>
                  <tr className="border-t border-brand-300 font-semibold text-brand-900">
                    <td className="py-1.5 pr-3">Stock</td>
                    <td className="py-1.5 pr-3" />
                    <td className="py-1.5 pr-3 text-right text-xs font-normal text-brand-500">
                      {fmtNum(d.totals.pieces)} pièces
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtDec3(d.totals.volumeM3)}
                    </td>
                    {d.columns.map((c) => (
                      <td key={c.key} className="py-1.5 pr-3 text-right tabular-nums">
                        {cell(d.totals.byColumn[c.key])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </TableWrap>
        </Card>
      )}

      {byKind.size > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[...byKind.entries()].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-brand-100 py-1">
              <dt className="text-brand-600">{LEDGER_KIND_LABELS[k]}</dt>
              <dd className={`tabular-nums ${v < 0 ? "text-amber-700" : "text-brand-900"}`}>
                {fmtDec3(v)} m³
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
