import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  saleLineAmountCfa,
  saleTotalCfa,
  saleTotalM3,
  type ContractDTO,
  type ContractSummaryDTO,
  type SaleCreateInput,
} from "@ste/shared";
import { accountsApi, salesApi } from "../lib/api";
import { fmtFcfa, fmtNum } from "../lib/format";
import Button from "./ui/Button";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";

type Mode = "USD" | "CFA";
type RowState = { sizeCode: string; volumeM3: string; mode: Mode; priceUsd: string; rate: string; priceCfa: string };

function emptyRow(c: ContractDTO): RowState {
  return {
    sizeCode: "",
    volumeM3: "",
    mode: "USD",
    priceUsd: c.sellingPriceUsd !== "0" ? c.sellingPriceUsd : "",
    rate: c.usdCfaRate !== "0" ? c.usdCfaRate : "",
    priceCfa: "",
  };
}

function rowAmount(r: RowState): number | null {
  const v = Number(r.volumeM3);
  if (!r.sizeCode || !r.volumeM3 || !(v > 0)) return null;
  if (r.mode === "CFA") {
    if (!r.priceCfa || !(Number(r.priceCfa) > 0)) return null;
    return saleLineAmountCfa({ volumeM3: v, unitPriceCfa: Number(r.priceCfa) });
  }
  if (!r.priceUsd || !r.rate) return null;
  return saleLineAmountCfa({ volumeM3: v, unitPriceUsd: Number(r.priceUsd), usdCfaRate: Number(r.rate) });
}

function SaleForm({
  contract,
  stock,
  onDone,
}: {
  contract: ContractDTO;
  stock: ContractSummaryDTO["stockBySize"];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<RowState[]>([emptyRow(contract)]);
  const [date, setDate] = useState("");
  const [clientId, setClientId] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parties = useQuery({ queryKey: ["parties"], queryFn: accountsApi.parties });

  const create = useMutation({
    mutationFn: (data: SaleCreateInput) => salesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", contract.id] });
      qc.invalidateQueries({ queryKey: ["summary", contract.id] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  const amounts = rows.map(rowAmount);
  const total = amounts.reduce<number>((s, a) => s + (a ?? 0), 0);

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function stockOf(code: string): number | null {
    const s = stock.find((x) => x.code === code);
    return s ? Number(s.stockM3) : null;
  }

  // Contrôle dispo durci : cumul demandé par taille sur toutes les lignes.
  const requestedBySize = new Map<string, number>();
  for (const r of rows) {
    if (r.sizeCode && Number(r.volumeM3) > 0)
      requestedBySize.set(r.sizeCode, (requestedBySize.get(r.sizeCode) ?? 0) + Number(r.volumeM3));
  }
  const oversold = [...requestedBySize.entries()]
    .map(([code, req]) => ({ code, req, dispo: stockOf(code) }))
    .filter((x) => x.dispo !== null && x.req > x.dispo + 1e-9);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (oversold.length > 0 && !override) {
      setError("Stock insuffisant sur une taille — cocher « vendre quand même » pour forcer.");
      return;
    }
    const lines = rows
      .filter((_, i) => amounts[i] !== null)
      .map((r) =>
        r.mode === "CFA"
          ? { sizeCode: r.sizeCode, volumeM3: r.volumeM3.trim(), unitPriceCfa: r.priceCfa.trim() }
          : {
              sizeCode: r.sizeCode,
              volumeM3: r.volumeM3.trim(),
              unitPriceUsd: r.priceUsd.trim(),
              usdCfaRate: r.rate.trim(),
            }
      );
    if (lines.length === 0) return;
    create.mutate({
      contractId: contract.id,
      clientId: clientId || undefined,
      saleDate: date ? new Date(date) : undefined,
      lines,
    } as SaleCreateInput);
  }

  return (
    <form onSubmit={submit} className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 grid grid-cols-2 gap-3 sm:w-96">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          >
            <option value="">— aucun —</option>
            {parties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.map((r, i) => {
        const dispo = stockOf(r.sizeCode);
        const over = dispo !== null && Number(r.volumeM3) > dispo;
        return (
          <div key={i} className="mb-2 rounded-lg border border-slate-100 p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Taille</span>
                <input
                  list="stock-sizes"
                  value={r.sizeCode}
                  onChange={(e) => setRow(i, { sizeCode: e.target.value })}
                  placeholder="6x4"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">
                  m³ {dispo !== null && <span className="text-slate-400">(dispo {fmtNum(dispo)})</span>}
                </span>
                <input
                  inputMode="decimal"
                  value={r.volumeM3}
                  onChange={(e) => setRow(i, { volumeM3: e.target.value })}
                  className={`rounded border px-2 py-1.5 text-sm outline-none ${
                    over ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-slate-900"
                  }`}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Mode</span>
                <select
                  value={r.mode}
                  onChange={(e) => setRow(i, { mode: e.target.value as Mode })}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900"
                >
                  <option value="USD">USD × taux</option>
                  <option value="CFA">CFA direct</option>
                </select>
              </label>
              <div className="flex items-end text-sm">
                <span className="text-slate-500">
                  ={" "}
                  <span className="font-semibold text-slate-900">
                    {amounts[i] !== null ? fmtFcfa(amounts[i]!) : "—"}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {r.mode === "USD" ? (
                <>
                  <input
                    inputMode="decimal"
                    value={r.priceUsd}
                    onChange={(e) => setRow(i, { priceUsd: e.target.value })}
                    placeholder="Prix USD"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900"
                  />
                  <input
                    inputMode="decimal"
                    value={r.rate}
                    onChange={(e) => setRow(i, { rate: e.target.value })}
                    placeholder="Taux CFA"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900"
                  />
                </>
              ) : (
                <input
                  inputMode="decimal"
                  value={r.priceCfa}
                  onChange={(e) => setRow(i, { priceCfa: e.target.value })}
                  placeholder="Prix CFA/m³"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900"
                />
              )}
              <button
                type="button"
                onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                className="ml-auto text-xs text-slate-400 hover:text-red-500"
              >
                Retirer
              </button>
            </div>
          </div>
        );
      })}

      <datalist id="stock-sizes">
        {stock.map((s) => (
          <option key={s.code} value={s.code} />
        ))}
      </datalist>

      <div className="mt-2 flex items-center justify-between">
        <Button size="xs" onClick={() => setRows((p) => [...p, emptyRow(contract)])}>
          + Ligne
        </Button>
        <div className="text-sm">
          <span className="text-slate-500">Total : </span>
          <span className="font-semibold text-slate-900">{fmtFcfa(total)}</span>
        </div>
      </div>

      {oversold.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          Stock insuffisant :{" "}
          {oversold
            .map((x) => `${x.code} (demandé ${fmtNum(x.req.toFixed(2))}, dispo ${fmtNum(x.dispo!.toFixed(2))})`)
            .join(", ")}
          <label className="mt-1 flex items-center gap-2 text-amber-800">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Vendre quand même
          </label>
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        {error && (
          <div className="mb-2">
            <FormError>{error}</FormError>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || (oversold.length > 0 && !override)}
          >
            Valider la vente
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function SalesSection({
  contract,
  stock,
}: {
  contract: ContractDTO;
  stock: ContractSummaryDTO["stockBySize"];
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const sales = useQuery({
    queryKey: ["sales", contract.id],
    queryFn: () => salesApi.listByContract(contract.id),
  });
  const parties = useQuery({ queryKey: ["parties"], queryFn: accountsApi.parties });
  const clientName = (id: string | null) =>
    id ? (parties.data?.find((p) => p.id === id)?.name ?? "Client") : null;

  const remove = useMutation({
    mutationFn: salesApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", contract.id] });
      qc.invalidateQueries({ queryKey: ["summary", contract.id] });
    },
  });

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Ventes ({sales.data?.length ?? 0})
        </h2>
        <Button size="xs" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Fermer" : "+ Vente"}
        </Button>
      </div>

      {showForm && <SaleForm contract={contract} stock={stock} onDone={() => setShowForm(false)} />}

      <div className="space-y-2">
        {sales.isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
        {sales.isError && (
          <QueryError error={sales.error} onRetry={() => sales.refetch()}>
            Impossible de charger les ventes
          </QueryError>
        )}
        {sales.data?.length === 0 && !showForm && <EmptyState>Aucune vente.</EmptyState>}
        {sales.data?.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-900">
                {new Date(s.saleDate).toLocaleDateString("fr-FR")}
                {clientName(s.clientId) ? ` · ${clientName(s.clientId)}` : ""}
                {s.deliveryNote ? ` · B/L ${s.deliveryNote}` : ""}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-900">
                  {fmtFcfa(saleTotalCfa(s))}
                </span>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Supprimer cette vente du ${new Date(s.saleDate).toLocaleDateString("fr-FR")} (${fmtFcfa(saleTotalCfa(s))}) ? Action irréversible.`
                      )
                    )
                      remove.mutate(s.id);
                  }}
                  className="text-xs text-slate-400 hover:text-red-500"
                  aria-label="Supprimer la vente"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {fmtNum(saleTotalM3(s).toFixed(3))} m³ ·{" "}
              {s.lines.map((l) => `${l.sizeCode} ${Number(l.volumeM3).toFixed(2)}`).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
