import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  QUALITY_LABELS,
  suiviColumnIndex,
  suiviColumnLabel,
  type SawnInventoryRowDTO,
} from "@ste/shared";
import ResawSection from "../components/ResawSection";
import StockMovementsTab from "../components/stock/StockMovementsTab";
import StockSuiviTab from "../components/stock/StockSuiviTab";
import { PageHeader } from "../components/Layout";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { Kpi, KpiStrip, SectionHeading } from "../components/ui/Card";
import { EmptyState, QueryError, Notice } from "../components/ui/Feedback";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { TableWrap } from "../components/ui/Table";
import Tabs from "../components/ui/Tabs";
import { downloadFile, stockApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtDec3, fmtInt, fmtM3, fmtNum } from "../lib/format";
import { IconChevronRight } from "../components/icons";

// Un seul stock, tous contrats confondus, tenu comme les classeurs du client :
// dernier inventaire + sciage + nouvelle mesure − empotage − livraisons,
// ventes, séchoir, menuiserie, rejets − ancienne mesure. L'onglet Stock est
// le tableau STOCK (pièces par L × l × ép), l'onglet Suivi le SUIVI PAR
// EPAISSEUR (une ligne par mouvement).

type TabKey = "stock" | "suivi" | "mouvements" | "resciage";
const TABS: { key: TabKey; label: string }[] = [
  { key: "stock", label: "Stock" },
  { key: "suivi", label: "Suivi par épaisseur" },
  { key: "mouvements", label: "Inventaire et sorties" },
  { key: "resciage", label: "Resciage" },
];

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export default function StockPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const raw = params.get("onglet");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "stock";
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  async function exportFile(path: string, name: string) {
    setExportError(null);
    setExporting(path);
    try {
      await downloadFile(path, name);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Avivés par dimension et suivi des mouvements, tous contrats confondus."
        right={
          can("stock.export") && (
            <>
              <Button
                size="sm"
                disabled={exporting !== null}
                onClick={() => exportFile("/stock/stock.xlsx", `STOCK DU ${stamp()}.xlsx`)}
              >
                {exporting === "/stock/stock.xlsx" ? "Export…" : "Exporter STOCK"}
              </Button>
              <Button
                size="sm"
                disabled={exporting !== null}
                onClick={() =>
                  exportFile("/stock/suivi.xlsx", `SUIVI SCIAGE PAR EPAISSEUR DU ${stamp()}.xlsx`)
                }
              >
                {exporting === "/stock/suivi.xlsx" ? "Export…" : "Exporter SUIVI"}
              </Button>
            </>
          )
        }
      />
      <div className="mx-auto max-w-page-wide px-4 pb-6 pt-3 short:py-3">
        {exportError && (
          <Notice tone="danger" className="mb-3">
            Export impossible : {exportError}
          </Notice>
        )}
        <Tabs
          label="Sections du stock"
          tabs={TABS}
          value={tab}
          onChange={(k) => {
            const next = new URLSearchParams(params);
            if (k === "stock") next.delete("onglet");
            else next.set("onglet", k);
            setParams(next, { replace: true });
          }}
          className="mb-6"
        />
        {tab === "stock" && <StockTab />}
        {tab === "suivi" && <StockSuiviTab />}
        {tab === "mouvements" && <StockMovementsTab />}
        {tab === "resciage" && <ResawTab />}
      </div>
    </>
  );
}

// Téléphone : liseré à droite de la colonne figée — sans lui, les chiffres
// qui défilent dessous paraissent coupés net. Mobile-first : l'écran `short`
// (raw) désactive les variantes max-*.
const FROZEN_EDGE =
  "[&_td:first-child]:shadow-[inset_-1px_0_0_theme(colors.brand.200)] " +
  "[&_th:first-child]:shadow-[inset_-1px_0_0_theme(colors.brand.200)] " +
  "sm:[&_td:first-child]:shadow-none sm:[&_th:first-child]:shadow-none";

const CODE_INSET = "pl-[1.375rem]";
// Colonne masquée sur téléphone (mobile-first : `max-*` inopérant ici).
const SM_CELL = "hidden sm:table-cell";
const DETAIL_INSET = "pl-9";

/** Entier signé avec un vrai « − » (pas le tiret ASCII). */
const minus = (n: number) => (n < 0 ? "−" : "") + fmtNum(Math.abs(n));

// Zéro = tiret clair : seules les valeurs réelles accrochent l'œil.
function m3OrDash(v: string | number): ReactNode {
  return Math.abs(Number(v)) < 0.0005 ? <span className="text-brand-500">—</span> : fmtDec3(v);
}

function useStockQueries() {
  const inventory = useQuery({
    queryKey: ["stock", "inventory"],
    queryFn: () => stockApi.sawnInventory(),
  });
  const ledger = useQuery({ queryKey: ["stock", "ledger"], queryFn: () => stockApi.ledger() });
  return { inventory, ledger };
}

type ProductRow = {
  key: string;
  label: string;
  inventoryM3: number;
  inM3: number;
  outM3: number;
  stockM3: number;
  pieces: number;
  reserved: number;
  dims: SawnInventoryRowDTO[];
};

function StockTab() {
  const { inventory, ledger } = useStockQueries();
  const parc = useQuery({ queryKey: ["stock", "parc"], queryFn: () => stockApi.parc() });
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Un produit = une colonne du suivi (8" +, 6X3 B, 1 inch…) ; dépliée, ses
  // dimensions exactes — le tableau STOCK du client.
  const products = useMemo(() => {
    const m = new Map<string, ProductRow>();
    for (const r of inventory.data ?? []) {
      const u = Number(r.unitM3);
      let p = m.get(r.suiviKey);
      if (!p) {
        p = {
          key: r.suiviKey,
          label: suiviColumnLabel(r.suiviKey),
          inventoryM3: 0,
          inM3: 0,
          outM3: 0,
          stockM3: 0,
          pieces: 0,
          reserved: 0,
          dims: [],
        };
        m.set(r.suiviKey, p);
      }
      p.inventoryM3 += u * r.inventoryCount;
      p.inM3 += u * (r.producedCount + r.resawnInCount);
      p.outM3 += u * (r.packedCount + r.otherOutCount + r.resawnOutCount);
      p.stockM3 += Number(r.stockM3);
      p.pieces += r.stockCount;
      p.reserved += r.reservedCount;
      if (r.stockCount !== 0 || r.reservedCount !== 0) p.dims.push(r);
    }
    return [...m.values()]
      .filter((p) => p.dims.length > 0 || Math.abs(p.stockM3) > 0.0005)
      .sort((a, b) => suiviColumnIndex(a.key) - suiviColumnIndex(b.key));
  }, [inventory.data]);

  if (inventory.isError) {
    return (
      <QueryError error={inventory.error} onRetry={() => inventory.refetch()}>
        Impossible de charger le stock
      </QueryError>
    );
  }
  if (!inventory.data) return <SkeletonList count={3} />;

  const rows = inventory.data;
  const stockM3 = rows.reduce((s, r) => s + Number(r.stockM3), 0);
  const pieces = rows.reduce((s, r) => s + r.stockCount, 0);
  const reserved = rows.reduce((s, r) => s + r.reservedCount, 0);
  const reservedM3 = rows.reduce((s, r) => s + Number(r.unitM3) * r.reservedCount, 0);
  const negatives = rows.filter((r) => r.stockCount < 0);
  const parcTrucks = parc.data ?? [];
  const parcM3 = parcTrucks.reduce((s, t) => s + Number(t.girthM3), 0);
  const inv = ledger.data?.inventory;

  function toggle(key: string) {
    setOpen((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      {ledger.data && (
        <Notice tone="neutral" className="mb-4">
          {inv ? (
            <>
              Stock compté à partir de l'inventaire du{" "}
              <span className="font-medium">
                {new Date(inv.movedAt).toLocaleDateString("fr-FR")}
              </span>{" "}
              ({fmtM3(inv.totalM3)}, comptage de fin de journée), plus les mouvements datés du lendemain
              ou après.
            </>
          ) : (
            <>
              Aucun inventaire saisi : le stock part de zéro et cumule tout l'historique. Saisir ou
              importer un inventaire dans l'onglet Inventaire et sorties pour repartir du stock
              compté.
            </>
          )}
        </Notice>
      )}
      {negatives.length > 0 && (
        <Notice tone="danger" className="mb-4">
          Stock négatif sur {negatives.length} dimension{negatives.length > 1 ? "s" : ""} :{" "}
          {negatives
            .slice(0, 6)
            .map(
              (r) =>
                `${fmtNum(r.lengthFt)}×${fmtNum(r.widthIn)}×${fmtNum(r.thicknessIn)} ${QUALITY_LABELS[r.quality]} (${minus(r.stockCount)})`
            )
            .join(", ")}
          {negatives.length > 6 ? "…" : "."} Il sort plus de pièces qu'il n'en est entré : saisir
          le sciage manquant ou refaire l'inventaire.
        </Notice>
      )}

      <KpiStrip className="mb-8">
        <Kpi
          bare
          label="Stock parc"
          value={<span className="tabular-nums">{parc.data ? fmtM3(parcM3) : "…"}</span>}
          hint="billons non sciés"
        />
        <Kpi
          bare
          label="Stock avivés"
          value={<span className="tabular-nums">{fmtM3(stockM3)}</span>}
          hint="toutes dimensions"
        />
        <Kpi bare label="Pièces" value={<span className="tabular-nums">{fmtNum(pieces)}</span>} />
        <Kpi
          bare
          label="Réservé"
          value={<span className="tabular-nums">{fmtNum(reserved)}</span>}
          hint={reserved > 0 ? `${fmtM3(reservedM3)} en conteneur prévu` : "aucun conteneur prévu"}
        />
      </KpiStrip>

      <section className="mb-8">
        <SectionHeading>Avivés par produit</SectionHeading>
        {products.length === 0 ? (
          <EmptyState>
            Aucun avivé en stock. Le débitage, le resciage et l'inventaire alimentent ce tableau.
          </EmptyState>
        ) : (
          <Card>
            <TableWrap stickyFirstCol className={FROZEN_EDGE}>
              {/* Téléphone : Stock m³ et Pièces seuls à côté du produit ; le
                  détail inventaire / entrées / sorties revient dès sm. */}
              <table className="w-full text-base sm:min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-brand-500">
                    <th className="py-1 pr-4 font-normal">Produit</th>
                    <th className={`${SM_CELL} py-1 pr-4 text-right font-normal`}>Inventaire</th>
                    <th className={`${SM_CELL} py-1 pr-4 text-right font-normal`}>Entrées</th>
                    <th className={`${SM_CELL} py-1 pr-4 text-right font-normal`}>Sorties</th>
                    <th className="py-1 pr-4 text-right font-normal">Stock m³</th>
                    <th className="py-1 text-right font-normal">Pièces</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const isOpen = open.has(p.key);
                    return (
                      <Fragment key={p.key}>
                        <tr className="border-t border-brand-100">
                          <td className="py-1 pr-4 font-medium">
                            {p.dims.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggle(p.key)}
                                aria-expanded={isOpen}
                                className="-mx-1 inline-flex min-h-touch items-center gap-1.5 rounded-lg px-1 text-brand-900 transition-colors duration-150 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100"
                              >
                                <IconChevronRight
                                  width={16}
                                  height={16}
                                  strokeWidth={2}
                                  className={`shrink-0 text-brand-500 transition-transform duration-150 ease-out motion-reduce:transition-none ${
                                    isOpen ? "rotate-90" : ""
                                  }`}
                                />
                                {p.label}
                                <span className="sr-only"> — détail par dimension</span>
                              </button>
                            ) : (
                              <span
                                className={`inline-flex min-h-touch items-center text-brand-900 ${CODE_INSET}`}
                              >
                                {p.label}
                              </span>
                            )}
                          </td>
                          <td className={`${SM_CELL} py-1 pr-4 text-right tabular-nums`}>
                            {m3OrDash(p.inventoryM3)}
                          </td>
                          <td className={`${SM_CELL} py-1 pr-4 text-right tabular-nums text-parc-700`}>
                            {m3OrDash(p.inM3)}
                          </td>
                          <td className={`${SM_CELL} py-1 pr-4 text-right tabular-nums text-amber-700`}>
                            {Math.abs(p.outM3) < 0.0005 ? m3OrDash(0) : fmtDec3(-p.outM3)}
                          </td>
                          <td
                            className={`py-1 pr-4 text-right font-medium tabular-nums ${
                              p.stockM3 < -0.0005 ? "text-red-600" : "text-brand-900"
                            }`}
                          >
                            {fmtDec3(p.stockM3)}
                          </td>
                          <td className="py-1 text-right font-medium tabular-nums">
                            {minus(p.pieces)}
                          </td>
                        </tr>
                        {isOpen &&
                          p.dims.map((d) => (
                            <tr key={d.key} className="border-t border-brand-100 bg-brand-50 text-sm">
                              <td
                                className={`py-1 pr-4 tabular-nums text-brand-700 !bg-brand-50 ${DETAIL_INSET}`}
                              >
                                {fmtNum(d.lengthFt)} ft · {fmtNum(d.widthIn)}×{fmtNum(d.thicknessIn)}
                              </td>
                              <td
                                colSpan={3}
                                className={`${SM_CELL} py-1 pr-4 text-right tabular-nums text-brand-600`}
                              >
                                {d.reservedCount > 0
                                  ? `${fmtNum(d.reservedCount)} réservées · ${fmtNum(d.availableCount)} libres`
                                  : `${fmtNum(d.unitM3)} m³/pièce`}
                              </td>
                              <td
                                className={`py-1 pr-4 text-right tabular-nums ${
                                  d.stockCount < 0 ? "text-red-600" : "text-brand-700"
                                }`}
                              >
                                {fmtDec3(d.stockM3)}
                              </td>
                              <td className="py-1 text-right font-medium tabular-nums text-brand-900">
                                {minus(d.stockCount)}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-brand-200 font-semibold">
                    <td className="py-1.5 pr-4">Total</td>
                    <td className={`${SM_CELL} py-1.5 pr-4 text-right tabular-nums`}>
                      {m3OrDash(products.reduce((s, p) => s + p.inventoryM3, 0))}
                    </td>
                    <td className={`${SM_CELL} py-1.5 pr-4 text-right tabular-nums text-parc-700`}>
                      {m3OrDash(products.reduce((s, p) => s + p.inM3, 0))}
                    </td>
                    <td className={`${SM_CELL} py-1.5 pr-4 text-right tabular-nums text-amber-700`}>
                      {fmtDec3(-products.reduce((s, p) => s + p.outM3, 0))}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{fmtDec3(stockM3)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtNum(pieces)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
            <p className="mt-2 text-xs text-brand-500">
              Entrées = sciage + nouvelle mesure (resciage). Sorties = empotage, livraisons, ventes,
              séchoir, menuiserie, rejets, ancienne mesure. Un conteneur prévu réserve ses pièces
              sans les sortir du stock.
            </p>
          </Card>
        )}
      </section>

      {/* Section toujours visible : un parc vide ou en erreur ne doit pas
          ressembler à une section oubliée. */}
      <section>
        <SectionHeading>Billons au parc, non sciés</SectionHeading>
        {parc.isLoading && <SkeletonCard lines={3} />}
        {parc.isError && (
          <QueryError error={parc.error} onRetry={() => parc.refetch()}>
            Impossible de charger les camions du parc
          </QueryError>
        )}
        {parc.data?.length === 0 && (
          <EmptyState>Aucun billon en attente de sciage : tout le parc est passé à la scie.</EmptyState>
        )}
        {parcTrucks.length > 0 && (
          <Card>
            <TableWrap stickyFirstCol className={FROZEN_EDGE}>
              <table className="w-full min-w-[26rem] text-base sm:min-w-[680px]">
                <thead>
                  <tr className="whitespace-nowrap text-left text-xs text-brand-500">
                    <th className="py-1 pr-4 font-normal">Camion</th>
                    <th className="hidden py-1 pr-4 font-normal sm:table-cell">Contrat</th>
                    <th className="hidden py-1 pr-4 font-normal sm:table-cell">B/L</th>
                    <th className="py-1 pr-4 text-right font-normal">Billons</th>
                    <th className="py-1 pr-4 text-right font-normal">m³</th>
                    <th className="py-1 pr-4 text-right font-normal">≥ 85 cm</th>
                    <th className="py-1 text-right font-normal">&lt; 85 cm</th>
                  </tr>
                </thead>
                <tbody>
                  {parcTrucks.map((t) => (
                    <tr key={t.truckId} className="border-t border-brand-100">
                      <td className="py-1 pr-4 font-medium text-brand-900">
                        {t.registration}
                        <div className="whitespace-nowrap text-sm font-normal text-brand-500 sm:hidden">
                          {t.contractCode}
                          {t.deliveryNote && ` · ${t.deliveryNote}`}
                        </div>
                      </td>
                      <td className="hidden py-1 pr-4 text-brand-500 sm:table-cell">
                        {t.contractCode}
                      </td>
                      <td className="hidden py-1 pr-4 text-brand-500 sm:table-cell">
                        {t.deliveryNote ?? "—"}
                      </td>
                      <td className="py-1 pr-4 text-right tabular-nums">
                        {t.billonCount ? fmtInt(t.billonCount) : "—"}
                      </td>
                      <td className="py-1 pr-4 text-right tabular-nums">{fmtDec3(t.girthM3)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums text-parc-700">
                        {fmtDec3(t.girthGte85M3)}
                      </td>
                      <td className="py-1 text-right tabular-nums text-brand-500">
                        {fmtDec3(t.girthLt85M3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-brand-200 font-semibold">
                    <td className="whitespace-nowrap py-1.5 pr-4">
                      Total ({parcTrucks.length} camion{parcTrucks.length > 1 ? "s" : ""})
                    </td>
                    {/* Cellule à part : un colSpan sur des colonnes masquées
                        décalerait les totaux sur téléphone. */}
                    <td colSpan={2} className="hidden sm:table-cell" />
                    <td className="py-1.5 pr-4 text-right tabular-nums">
                      {fmtInt(parcTrucks.reduce((s2, t) => s2 + t.billonCount, 0))}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{fmtDec3(parcM3)}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-parc-700">
                      {fmtDec3(parcTrucks.reduce((s2, t) => s2 + Number(t.girthGte85M3), 0))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-brand-500">
                      {fmtDec3(parcTrucks.reduce((s2, t) => s2 + Number(t.girthLt85M3), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </Card>
        )}
      </section>
    </>
  );
}

function ResawTab() {
  const inventory = useQuery({
    queryKey: ["stock", "inventory"],
    queryFn: () => stockApi.sawnInventory(),
  });
  // Contrôle « consommé au-delà du stock » : m³ en stock par taille (6x4, 7"+…).
  const stockByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inventory.data ?? []) m.set(r.sizeCode, (m.get(r.sizeCode) ?? 0) + Number(r.stockM3));
    return m;
  }, [inventory.data]);
  return (
    <>
      <p className="mb-2 text-sm text-brand-600">
        Le bois consommé sort du stock en « ancienne mesure (recutting out) », le bois produit y
        rentre en « nouvelle mesure (recutting in) ».
      </p>
      <ResawSection stockByCode={stockByCode} />
      {inventory.isError && (
        <Badge tone="amber">Stock indisponible : le contrôle de dépassement est désactivé</Badge>
      )}
    </>
  );
}
