import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  saleLineAmountCfa,
  saleTotalCfa,
  saleTotalM3,
  type ContractDTO,
  type ContractSummaryDTO,
  type SaleCreateInput,
  type SaleDTO,
} from "@ste/shared";
import { accountsApi, salesApi } from "../lib/api";
import { fmtFcfa, fmtNum } from "../lib/format";
import Button from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field, Select, inputQuietCls } from "./ui/Input";

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
    <form onSubmit={submit} className="mb-3 rounded-xl border border-brand-200 bg-white p-4">
      <div className="mb-3 grid grid-cols-2 gap-3 sm:w-96">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— aucun —</option>
            {parties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {rows.map((r, i) => {
        const dispo = stockOf(r.sizeCode);
        const over = dispo !== null && Number(r.volumeM3) > dispo;
        return (
          <div key={i} className="mb-2 rounded-lg border border-brand-100 p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Taille">
                <Input
                  variant="quiet"
                  list="stock-sizes"
                  value={r.sizeCode}
                  onChange={(e) => setRow(i, { sizeCode: e.target.value })}
                  placeholder="6x4"
                />
              </Field>
              <Field
                label={
                  <>
                    m³{" "}
                    {dispo !== null && (
                      <span className="text-brand-400">(dispo {fmtNum(dispo)})</span>
                    )}
                  </>
                }
              >
                <input
                  inputMode="decimal"
                  value={r.volumeM3}
                  onChange={(e) => setRow(i, { volumeM3: e.target.value })}
                  className={`w-full min-w-0 min-h-touch rounded-lg border bg-white px-2.5 py-2 text-base outline-none ${
                    over
                      ? "border-red-400 focus:border-red-500"
                      : "border-brand-200 focus:border-brand-900"
                  }`}
                />
              </Field>
              <Field label="Mode">
                <Select value={r.mode} onChange={(e) => setRow(i, { mode: e.target.value as Mode })}>
                  <option value="USD">USD × taux</option>
                  <option value="CFA">CFA direct</option>
                </Select>
              </Field>
              <div className="flex items-end text-sm">
                <span className="text-brand-500">
                  ={" "}
                  <span className="font-semibold text-brand-900">
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
                    className={inputQuietCls}
                  />
                  <input
                    inputMode="decimal"
                    value={r.rate}
                    onChange={(e) => setRow(i, { rate: e.target.value })}
                    placeholder="Taux CFA"
                    className={inputQuietCls}
                  />
                </>
              ) : (
                <input
                  inputMode="decimal"
                  value={r.priceCfa}
                  onChange={(e) => setRow(i, { priceCfa: e.target.value })}
                  placeholder="Prix CFA/m³"
                  className={inputQuietCls}
                />
              )}
              <button
                type="button"
                onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                className="ml-auto min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
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
          <span className="text-brand-500">Total : </span>
          <span className="font-semibold text-brand-900">{fmtFcfa(total)}</span>
        </div>
      </div>

      {oversold.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          Stock insuffisant :{" "}
          {oversold
            .map((x) => `${x.code} (demandé ${fmtNum(x.req.toFixed(2))}, dispo ${fmtNum(x.dispo!.toFixed(2))})`)
            .join(", ")}
          <label className="mt-1 flex min-h-touch items-center gap-2 text-sm text-amber-800">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-5 w-5"
            />
            Vendre quand même
          </label>
        </div>
      )}

      <div className="mt-3 border-t border-brand-100 pt-3">
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
  // Confirmation lisible sur tablette (remplace window.confirm).
  const [delSale, setDelSale] = useState<SaleDTO | null>(null);

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
      <SectionHeading
        right={
          <Button size="xs" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Vente"}
          </Button>
        }
      >
        Ventes ({sales.data?.length ?? 0})
      </SectionHeading>

      {showForm && <SaleForm contract={contract} stock={stock} onDone={() => setShowForm(false)} />}

      <div className="space-y-2">
        {sales.isLoading && <p className="text-sm text-brand-500">Chargement…</p>}
        {sales.isError && (
          <QueryError error={sales.error} onRetry={() => sales.refetch()}>
            Impossible de charger les ventes
          </QueryError>
        )}
        {sales.data?.length === 0 && !showForm && <EmptyState>Aucune vente.</EmptyState>}
        {sales.data?.map((s) => (
          <div key={s.id} className="rounded-xl border border-brand-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-brand-900">
                {new Date(s.saleDate).toLocaleDateString("fr-FR")}
                {clientName(s.clientId) ? ` · ${clientName(s.clientId)}` : ""}
                {s.deliveryNote ? ` · B/L ${s.deliveryNote}` : ""}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-brand-900">
                  {fmtFcfa(saleTotalCfa(s))}
                </span>
                <button
                  onClick={() => setDelSale(s)}
                  className="inline-flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-400 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                  aria-label="Supprimer la vente"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="mt-1 text-sm text-brand-500">
              {fmtNum(saleTotalM3(s).toFixed(3))} m³ ·{" "}
              {s.lines.map((l) => `${l.sizeCode} ${Number(l.volumeM3).toFixed(2)}`).join(" · ")}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={delSale !== null}
        title="Supprimer cette vente ?"
        confirmLabel="Supprimer la vente"
        onConfirm={() => {
          if (delSale) remove.mutate(delSale.id);
          setDelSale(null);
        }}
        onCancel={() => setDelSale(null)}
      >
        {delSale
          ? `Vente du ${new Date(delSale.saleDate).toLocaleDateString("fr-FR")} (${fmtFcfa(saleTotalCfa(delSale))}). Action irréversible.`
          : null}
      </ConfirmDialog>
    </section>
  );
}
