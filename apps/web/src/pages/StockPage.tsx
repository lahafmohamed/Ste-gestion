import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS, type SawnInventoryRowDTO } from "@ste/shared";
import ResawSection from "../components/ResawSection";
import { PageHeader } from "../components/Layout";
import Badge, { SIZE_GROUP_TONE } from "../components/ui/Badge";
import Card, { Kpi, KpiStrip, SectionHeading } from "../components/ui/Card";
import { EmptyState, QueryError, Notice } from "../components/ui/Feedback";
import { SkeletonCard, SkeletonList } from "../components/ui/Skeleton";
import { TableWrap } from "../components/ui/Table";
import { stockApi } from "../lib/api";
import { fmtDec3, fmtM3, fmtNum } from "../lib/format";

// Un seul stock, tous contrats confondus : le débitage y verse, l'empotage et
// les ventes y puisent. Aucun contrat à choisir.
export default function StockPage() {
  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Parc (billons non sciés) & produits par taille — tous contrats."
      />
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        <StockInner />
      </div>
    </>
  );
}

// Retrait d'un code taille sans chevron (16px + gap 6px) : dépliables ou non,
// les codes restent alignés dans la colonne.
const CODE_INSET = "pl-[1.375rem]";

// Téléphone : liseré à droite de la colonne figée — sans lui, les chiffres
// qui défilent dessous paraissent coupés net (« ,200 » pour 4,200). Écrit en
// mobile-first : l'écran `short` (raw) désactive les variantes max-*.
const FROZEN_EDGE =
  "[&_td:first-child]:shadow-[inset_-1px_0_0_theme(colors.brand.200)] " +
  "[&_th:first-child]:shadow-[inset_-1px_0_0_theme(colors.brand.200)] " +
  "sm:[&_td:first-child]:shadow-none sm:[&_th:first-child]:shadow-none";

// Zéro = tiret clair : seules les valeurs réelles accrochent l'œil.
function m3OrDash(v: string | number): ReactNode {
  return Math.abs(Number(v)) < 0.0005 ? <span className="text-brand-500">—</span> : fmtDec3(v);
}

function StockInner() {
  const summary = useQuery({
    queryKey: ["stock", "summary"],
    queryFn: () => stockApi.summary(),
  });
  const parc = useQuery({
    queryKey: ["stock", "parc"],
    queryFn: () => stockApi.parc(),
  });
  // Détail L×l×ép avec nombre de pièces — même source que le panier d'empotage.
  const inventory = useQuery({
    queryKey: ["stock", "inventory"],
    queryFn: () => stockApi.sawnInventory(),
  });
  // Tailles dépliées (détail par longueur).
  const [openSizes, setOpenSizes] = useState<Set<string>>(new Set());

  // Tri section puis longueur : une taille comme 7"+ regroupe plusieurs
  // sections (8×6, 9×8…), chacune garde ses longueurs ensemble.
  const invByCode = useMemo(() => {
    const m = new Map<string, SawnInventoryRowDTO[]>();
    for (const r of inventory.data ?? []) {
      const list = m.get(r.sizeCode);
      if (list) list.push(r);
      else m.set(r.sizeCode, [r]);
    }
    for (const list of m.values()) {
      list.sort(
        (a, b) =>
          Number(a.widthIn) - Number(b.widthIn) ||
          Number(a.thicknessIn) - Number(b.thicknessIn) ||
          Number(a.lengthFt) - Number(b.lengthFt)
      );
    }
    return m;
  }, [inventory.data]);

  if (summary.isError) {
    return (
      <QueryError error={summary.error} onRetry={() => summary.refetch()}>
        Impossible de charger le stock
      </QueryError>
    );
  }
  const s = summary.data;
  if (!s) return <SkeletonList count={2} />;

  const inv = inventory.data ?? [];
  const availPieces = inv.reduce((sum, r) => sum + r.availableCount, 0);
  const packedPieces = inv.reduce((sum, r) => sum + r.packedCount, 0);
  // Pièces : « … » pendant le chargement, « — » si le détail n'a pas pu venir.
  const pieces = (n: number) => (inventory.data ? fmtNum(n) : inventory.isError ? "—" : "…");

  // Alerte : tailles en stock négatif (plus vendu que produit).
  const negatives = s.stockBySize.filter((r) => Number(r.stockM3) < 0);
  const parcTrucks = parc.data ?? [];
  const parcSum = (k: "girthGte85M3" | "girthLt85M3") =>
    parcTrucks.reduce((sum, t) => sum + Number(t[k]), 0);

  function toggleSize(code: string) {
    setOpenSizes((p) => {
      const next = new Set(p);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <>
      {negatives.length > 0 && (
        <Notice tone="danger" className="mb-4">
          Stock négatif sur {negatives.length} taille{negatives.length > 1 ? "s" : ""} :{" "}
          {negatives.map((r) => `${r.code} (${fmtDec3(r.stockM3)} m³)`).join(", ")}. Vérifier
          les ventes ou saisir le débitage manquant.
        </Notice>
      )}

      {/* Libellés courts + précision en hint : sur téléphone, un libellé sur
          deux lignes décalait la valeur de sa voisine. */}
      <KpiStrip className="mb-8">
        <Kpi bare label="Stock parc" value={fmtM3(s.stockParcM3)} hint="billons non sciés" />
        <Kpi bare label="Stock produits" value={fmtM3(s.stockProductsM3)} />
        {/* Pièces physiques : les ventes (en m³, sans nombre) ne s'y déduisent pas. */}
        <Kpi bare label="Pièces dispo" value={pieces(availPieces)} hint="hors ventes" />
        <Kpi bare label="Pièces empotées" value={pieces(packedPieces)} />
      </KpiStrip>

      {/* Section toujours visible : un parc vide ou en erreur ne doit pas
          ressembler à une section oubliée. */}
      <section className="mb-8">
        <SectionHeading>Parc — billons non sciés</SectionHeading>
        {parc.isLoading && <SkeletonCard lines={3} />}
        {parc.isError && (
          <QueryError error={parc.error} onRetry={() => parc.refetch()}>
            Impossible de charger les camions du parc
          </QueryError>
        )}
        {parc.data?.length === 0 && <EmptyState>Aucun billon en attente de sciage.</EmptyState>}
        {parcTrucks.length > 0 && (
          <Card>
            {/* 1re colonne figée : on garde l'immat sous les yeux en défilant.
                Téléphone : contrat et B/L passent sous l'immat, les volumes
                restent à l'écran au lieu de partir à droite. */}
            <TableWrap stickyFirstCol className={FROZEN_EDGE}>
              <table className="w-full min-w-[26rem] text-base sm:min-w-[680px]">
                <thead>
                  <tr className="whitespace-nowrap text-left text-xs text-brand-500">
                    <th className="py-1 pr-4 font-normal">Camion</th>
                    <th className="hidden py-1 pr-4 font-normal sm:table-cell">Contrat</th>
                    <th className="hidden py-1 pr-4 font-normal sm:table-cell">B/L</th>
                    <th className="py-1 pr-4 text-right font-normal"># Billons</th>
                    <th className="py-1 pr-4 text-right font-normal">Billons m³</th>
                    <th className="py-1 pr-4 text-right font-normal">≥85 cm</th>
                    <th className="py-1 text-right font-normal">&lt;85 cm</th>
                  </tr>
                </thead>
                <tbody>
                  {parcTrucks.map((t) => (
                    <tr key={t.truckId} className="border-t border-brand-100">
                      <td className="py-1 pr-4 font-medium">
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
                        {t.billonCount || "—"}
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
                      {parcTrucks.reduce((s2, t) => s2 + t.billonCount, 0)}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">
                      {fmtDec3(s.stockParcM3)}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-parc-700">
                      {fmtDec3(parcSum("girthGte85M3"))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-brand-500">
                      {fmtDec3(parcSum("girthLt85M3"))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </Card>
        )}
      </section>

      <section>
        <SectionHeading>Produits par taille</SectionHeading>
        {inventory.isError && (
          <div className="mb-3">
            <QueryError error={inventory.error} onRetry={() => inventory.refetch()}>
              Impossible de charger le détail des pièces
            </QueryError>
          </div>
        )}
        {s.stockBySize.length === 0 ? (
          <EmptyState>Aucun produit débité.</EmptyState>
        ) : (
          <Card>
            {/* Taille figée comme l'immat du parc : sur téléphone, Stock et
                Pièces se lisent en défilant sans perdre la ligne. */}
            <TableWrap stickyFirstCol className={FROZEN_EDGE}>
              <table className="w-full min-w-[640px] text-base">
                <thead>
                  <tr className="text-left text-xs text-brand-500">
                    <th className="py-1 pr-4 font-normal">Taille</th>
                    <th className="py-1 pr-4 font-normal">Groupe</th>
                    <th className="py-1 pr-4 text-right font-normal">Produit</th>
                    <th className="py-1 pr-4 text-right font-normal">Rescié</th>
                    <th className="py-1 pr-4 text-right font-normal">Vendu</th>
                    <th className="py-1 text-right font-normal">Stock</th>
                    <th className="py-1 pl-4 text-right font-normal">Pièces dispo</th>
                  </tr>
                </thead>
                <tbody>
                  {s.stockBySize.map((r) => {
                    // Effet net du resciage sur la taille : + = reçoit du bois
                    // rescié plus petit, − = part à la scie pour être rescié.
                    const resawNet = Number(r.resawnInM3) - Number(r.resawnOutM3);
                    const dims = invByCode.get(r.code) ?? [];
                    const sizePieces = dims.reduce((sum, d) => sum + d.availableCount, 0);
                    const open = openSizes.has(r.code);
                    // Plusieurs sections sous un même code (7"+, 2"…) : la
                    // longueur seule ne suffit plus à distinguer les lignes.
                    const multiSection =
                      new Set(dims.map((d) => `${d.widthIn}x${d.thicknessIn}`)).size > 1;
                    return (
                      <Fragment key={r.code}>
                        <tr className="border-t border-brand-100">
                          <td className="py-1 pr-4 font-medium">
                            {dims.length > 0 ? (
                              // Dépliable : détail par longueur (planches de chaque L).
                              <button
                                type="button"
                                onClick={() => toggleSize(r.code)}
                                aria-expanded={open}
                                className="-mx-1 inline-flex min-h-touch items-center gap-1.5 rounded-lg px-1 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`size-4 shrink-0 text-brand-500 transition-transform duration-150 ease-out motion-reduce:transition-none ${
                                    open ? "rotate-90" : ""
                                  }`}
                                  aria-hidden
                                >
                                  <path d="M9 6l6 6-6 6" />
                                </svg>
                                {r.code}
                                <span className="sr-only"> — détail par longueur</span>
                              </button>
                            ) : (
                              <span className={`inline-flex min-h-touch items-center ${CODE_INSET}`}>
                                {r.code}
                              </span>
                            )}
                          </td>
                          <td className="py-1 pr-4">
                            <Badge tone={SIZE_GROUP_TONE[r.group]}>
                              {SIZE_GROUP_LABELS[r.group]}
                            </Badge>
                          </td>
                          <td className="py-1 pr-4 text-right tabular-nums">
                            {m3OrDash(r.producedM3)}
                          </td>
                          <td
                            className={`py-1 pr-4 text-right tabular-nums ${
                              resawNet > 0 ? "text-parc-700" : "text-amber-700"
                            }`}
                          >
                            {Math.abs(resawNet) < 0.0005
                              ? m3OrDash(0)
                              : `${resawNet > 0 ? "+" : ""}${fmtDec3(resawNet)}`}
                          </td>
                          <td className="py-1 pr-4 text-right tabular-nums">
                            {m3OrDash(r.soldM3)}
                          </td>
                          <td
                            className={`py-1 text-right font-medium tabular-nums ${
                              Number(r.stockM3) < 0 ? "text-red-600" : "text-brand-900"
                            }`}
                          >
                            {fmtDec3(r.stockM3)}
                          </td>
                          <td className="py-1 pl-4 text-right font-medium tabular-nums">
                            {dims.length > 0
                              ? fmtNum(sizePieces)
                              : inventory.isPending
                                ? "…"
                                : "—"}
                          </td>
                        </tr>
                        {open &&
                          dims.map((d) => (
                            <tr key={d.key} className="border-t border-brand-100 bg-brand-50 text-sm">
                              {/* !bg : la colonne figée est peinte en blanc par TableWrap. */}
                              <td
                                className={`py-1 pr-4 tabular-nums text-brand-700 !bg-brand-50 ${CODE_INSET}`}
                              >
                                ↳ {fmtNum(d.lengthFt)} ft
                                {multiSection && (
                                  <span className="text-brand-500">
                                    {" "}
                                    · {fmtNum(d.widthIn)}×{fmtNum(d.thicknessIn)}
                                  </span>
                                )}
                              </td>
                              <td colSpan={5} className="py-1 pr-4 text-right text-brand-500">
                                {fmtNum(d.producedCount)} produites
                                {d.packedCount > 0 && ` · ${fmtNum(d.packedCount)} empotées`}
                                {" · "}
                                {fmtDec3(d.availableM3)} m³ dispo
                              </td>
                              <td className="py-1 pl-4 text-right font-medium tabular-nums text-brand-900">
                                {fmtNum(d.availableCount)}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            {/* Les ventes sont saisies en m³ par taille, sans nombre de pièces : le
                compteur « pièces » reste donc le bois physiquement empotable. */}
            <p className="mt-2 text-xs text-brand-500">
              Stock = produit ± rescié − vendu (m³). Pièces dispo = produit ± rescié −
              empoté (hors ventes, saisies en m³ sans nombre de pièces).
            </p>
          </Card>
        )}
      </section>

      <ResawSection stockBySize={s.stockBySize} />
    </>
  );
}
