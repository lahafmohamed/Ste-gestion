import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS, type SawnInventoryRowDTO } from "@ste/shared";
import ResawSection from "../components/ResawSection";
import StepLayout from "../components/StepLayout";
import Badge, { SIZE_GROUP_TONE } from "../components/ui/Badge";
import Card, { Kpi, SectionHeading } from "../components/ui/Card";
import { SkeletonList } from "../components/ui/Skeleton";
import { TableWrap } from "../components/ui/Table";
import { contractsApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";

export default function StockPage() {
  return (
    <StepLayout
      title="Stock"
      subtitle="Parc (billons non sciés) & produits par taille."
      wide
    >
      {(c) => <StockInner contractId={c.id} />}
    </StepLayout>
  );
}

function StockInner({ contractId }: { contractId: string }) {
  const summary = useQuery({
    queryKey: ["summary", contractId],
    queryFn: () => contractsApi.summary(contractId),
  });
  const truckStats = useQuery({
    queryKey: ["truck-stats", contractId],
    queryFn: () => contractsApi.truckStats(contractId),
  });
  // Détail L×l×ép avec nombre de pièces — même source que le panier d'empotage.
  const inventory = useQuery({
    queryKey: ["sawn-inventory", contractId],
    queryFn: () => contractsApi.sawnInventory(contractId),
  });
  // Tailles dépliées (détail par longueur).
  const [openSizes, setOpenSizes] = useState<Set<string>>(new Set());

  const invByCode = useMemo(() => {
    const m = new Map<string, SawnInventoryRowDTO[]>();
    for (const r of inventory.data ?? []) {
      const list = m.get(r.sizeCode);
      if (list) list.push(r);
      else m.set(r.sizeCode, [r]);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.lengthFt) - Number(b.lengthFt));
    return m;
  }, [inventory.data]);

  const s = summary.data;
  if (!s) return <SkeletonList count={2} />;

  const inv = inventory.data ?? [];
  const availPieces = inv.reduce((sum, r) => sum + r.availableCount, 0);
  const packedPieces = inv.reduce((sum, r) => sum + r.packedCount, 0);

  // Alerte : tailles en stock négatif (plus vendu que produit).
  const negatives = s.stockBySize.filter((r) => Number(r.stockM3) < 0);
  // Camions au parc non sciés (grumes en attente de débitage).
  const parcTrucks = (truckStats.data ?? []).filter((t) => !t.sawn);

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
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⚠ Stock négatif sur {negatives.length} taille(s) :{" "}
          {negatives.map((r) => `${r.code} (${fmtNum(r.stockM3)})`).join(", ")}. Vérifier les
          ventes ou saisir le débitage manquant.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Stock parc (billons non sciés)" value={fmtM3(s.stockParcM3)} />
        <Kpi label="Stock produits" value={fmtM3(s.stockProductsM3)} />
        {/* Pièces physiques : les ventes (en m³, sans nombre) ne s'y déduisent pas. */}
        <Kpi
          label="Pièces dispo (hors ventes)"
          value={inventory.data ? fmtNum(availPieces) : "…"}
        />
        <Kpi label="Pièces empotées" value={inventory.data ? fmtNum(packedPieces) : "…"} />
      </div>

      {parcTrucks.length > 0 && (
        <>
          <SectionHeading>Parc — billons par camion (non sciés)</SectionHeading>
          {/* min-w : sur téléphone les 6 colonnes s'écrasaient au lieu de défiler.
              1re colonne figée : on garde l'immat sous les yeux en défilant. */}
          <Card className="mb-4">
            <TableWrap stickyFirstCol>
              <table className="w-full min-w-[600px] text-base">
              <thead>
                <tr className="text-left text-xs text-brand-500">
                  <th className="py-1 pr-4 font-normal">Camion</th>
                  <th className="py-1 pr-4 font-normal">B/L</th>
                  <th className="py-1 pr-4 text-right font-normal"># Billons</th>
                  <th className="py-1 pr-4 text-right font-normal">Billons m³</th>
                  <th className="py-1 pr-4 text-right font-normal">≥85</th>
                  <th className="py-1 text-right font-normal">&lt;85</th>
                </tr>
              </thead>
              <tbody>
                {parcTrucks.map((t) => (
                  <tr key={t.truckId} className="border-t border-brand-100">
                    <td className="py-1 pr-4 font-medium">{t.registration}</td>
                    <td className="py-1 pr-4 text-brand-500">{t.deliveryNote ?? "—"}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">
                      {t.billonCount || "—"}
                    </td>
                    <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(t.girthM3)}</td>
                    <td className="py-1 pr-4 text-right tabular-nums text-parc-700">
                      {fmtNum(t.girthGte85M3)}
                    </td>
                    <td className="py-1 text-right tabular-nums text-brand-500">
                      {fmtNum(t.girthLt85M3)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-200 font-semibold">
                  <td colSpan={2} className="py-1.5">
                    Total parc ({parcTrucks.length} camion{parcTrucks.length > 1 ? "s" : ""})
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {parcTrucks.reduce((s2, t) => s2 + t.billonCount, 0)}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{fmtM3(s.stockParcM3)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
              </table>
            </TableWrap>
          </Card>
        </>
      )}

      <SectionHeading>Produits par taille (produit ± rescié − vendu)</SectionHeading>
      <Card>
        {s.stockBySize.length === 0 ? (
          <p className="text-sm text-brand-500">Aucun produit débité.</p>
        ) : (
          <TableWrap>
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
                return (
                <Fragment key={r.code}>
                <tr className="border-t border-brand-100">
                  <td className="py-1 pr-4 font-medium">
                    {dims.length > 0 ? (
                      // Dépliable : détail par longueur (combien de planches de chaque L).
                      <button
                        type="button"
                        onClick={() => toggleSize(r.code)}
                        aria-expanded={open}
                        className="-mx-1 inline-flex min-h-touch items-center gap-1.5 rounded-lg px-1 hover:bg-brand-50 active:bg-brand-100"
                      >
                        <span aria-hidden="true" className="text-xs text-brand-400">
                          {open ? "▾" : "▸"}
                        </span>
                        {r.code}
                      </button>
                    ) : (
                      r.code
                    )}
                  </td>
                  <td className="py-1 pr-4">
                    <Badge tone={SIZE_GROUP_TONE[r.group]}>{SIZE_GROUP_LABELS[r.group]}</Badge>
                  </td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(r.producedM3)}</td>
                  <td
                    className={`py-1 pr-4 text-right tabular-nums ${
                      resawNet > 0
                        ? "text-parc-700"
                        : resawNet < 0
                          ? "text-amber-700"
                          : "text-brand-400"
                    }`}
                  >
                    {resawNet === 0
                      ? "—"
                      : `${resawNet > 0 ? "+" : "−"}${fmtNum(Math.abs(resawNet).toFixed(3))}`}
                  </td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(r.soldM3)}</td>
                  <td
                    className={`py-1 text-right font-medium tabular-nums ${
                      Number(r.stockM3) < 0 ? "text-red-600" : "text-brand-900"
                    }`}
                  >
                    {fmtNum(r.stockM3)}
                  </td>
                  <td className="py-1 pl-4 text-right font-medium tabular-nums">
                    {dims.length > 0 ? fmtNum(sizePieces) : "—"}
                  </td>
                </tr>
                {open &&
                  dims.map((d) => (
                    <tr key={d.key} className="border-t border-brand-100 bg-brand-50 text-sm">
                      <td className="py-1 pl-5 pr-4 tabular-nums text-brand-700">
                        ↳ {fmtNum(d.lengthFt)} ft
                      </td>
                      <td colSpan={5} className="py-1 pr-4 text-right text-brand-500">
                        {fmtNum(d.producedCount)} produites
                        {d.packedCount > 0 && ` · ${fmtNum(d.packedCount)} empotées`}
                        {" · "}
                        {fmtNum(d.availableM3)} m³ dispo
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
        )}
        {/* Les ventes sont saisies en m³ par taille, sans nombre de pièces : le
            compteur « pièces » reste donc le bois physiquement empotable. */}
        {s.stockBySize.length > 0 && (
          <p className="mt-2 text-xs text-brand-400">
            Pièces dispo = produit ± rescié − empoté (hors ventes, saisies en m³ sans nombre
            de pièces).
          </p>
        )}
      </Card>

      <ResawSection contractId={contractId} summary={s} />
    </>
  );
}
