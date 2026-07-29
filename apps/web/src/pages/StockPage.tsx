import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS } from "@ste/shared";
import StepLayout from "../components/StepLayout";
import Badge, { SIZE_GROUP_TONE } from "../components/ui/Badge";
import { contractsApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";

export default function StockPage() {
  return (
    <StepLayout title="Stock" subtitle="Parc (billons non sciés) & produits par taille.">
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
  const s = summary.data;
  if (!s) return <p className="text-sm text-slate-500">Chargement…</p>;

  // Alerte : tailles en stock négatif (plus vendu que produit).
  const negatives = s.stockBySize.filter((r) => Number(r.stockM3) < 0);
  // Camions au parc non sciés (grumes en attente de débitage).
  const parcTrucks = (truckStats.data ?? []).filter((t) => !t.sawn);

  return (
    <>
      {negatives.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⚠ Stock négatif sur {negatives.length} taille(s) :{" "}
          {negatives.map((r) => `${r.code} (${fmtNum(r.stockM3)})`).join(", ")}. Vérifier les
          ventes ou saisir le débitage manquant.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Stock parc (billons non sciés)</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{fmtM3(s.stockParcM3)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Stock produits</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{fmtM3(s.stockProductsM3)}</div>
        </div>
      </div>

      {parcTrucks.length > 0 && (
        <>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Parc — billons par camion (non sciés)
          </h2>
          <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
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
                  <tr key={t.truckId} className="border-t border-slate-100">
                    <td className="py-1 pr-4 font-medium">{t.registration}</td>
                    <td className="py-1 pr-4 text-slate-500">{t.deliveryNote ?? "—"}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">
                      {t.billonCount || "—"}
                    </td>
                    <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(t.girthM3)}</td>
                    <td className="py-1 pr-4 text-right tabular-nums text-emerald-700">
                      {fmtNum(t.girthGte85M3)}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-500">
                      {fmtNum(t.girthLt85M3)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
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
          </div>
        </>
      )}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Produits par taille (produit − vendu)
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        {s.stockBySize.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun produit débité.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-4 font-normal">Taille</th>
                <th className="py-1 pr-4 font-normal">Groupe</th>
                <th className="py-1 pr-4 text-right font-normal">Produit</th>
                <th className="py-1 pr-4 text-right font-normal">Vendu</th>
                <th className="py-1 text-right font-normal">Stock</th>
              </tr>
            </thead>
            <tbody>
              {s.stockBySize.map((r) => (
                <tr key={r.code} className="border-t border-slate-100">
                  <td className="py-1 pr-4 font-medium">{r.code}</td>
                  <td className="py-1 pr-4">
                    <Badge tone={SIZE_GROUP_TONE[r.group]}>{SIZE_GROUP_LABELS[r.group]}</Badge>
                  </td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(r.producedM3)}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmtNum(r.soldM3)}</td>
                  <td
                    className={`py-1 text-right font-medium tabular-nums ${
                      Number(r.stockM3) < 0 ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {fmtNum(r.stockM3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
