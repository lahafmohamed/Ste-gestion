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
import { useCan } from "../lib/auth";
import { fmtFcfa, fmtM3, normalizeDecimal } from "../lib/format";
import Button from "./ui/Button";
import { SectionHeading, cardCls } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import DateField from "./ui/DateField";
import { EmptyState, FormError, Notice, QueryError } from "./ui/Feedback";
import Input, { Field, inputErrorCls } from "./ui/Input";
import SelectField from "./ui/SelectField";
import { SkeletonList } from "./ui/Skeleton";
import { IconPlus, IconX } from "./icons";

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
    <form onSubmit={submit} className={`mb-3 ${cardCls} p-4`}>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:w-96">
        <Field label="Date">
          <DateField value={date} onChange={setDate} />
        </Field>
        <Field label="Client">
          <SelectField
            value={clientId}
            onChange={setClientId}
            placeholder="— aucun —"
            aria-label="Client"
            options={(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </div>

      {rows.map((r, i) => {
        const dispo = stockOf(r.sizeCode);
        const over = dispo !== null && Number(r.volumeM3) > dispo;
        const n = rows.length > 1 ? ` ${i + 1}` : "";
        return (
          <div key={i} className="mb-2 rounded-lg border border-brand-100 p-3">
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
                    Volume (m³){" "}
                    {dispo !== null && (
                      <span className="font-normal tabular-nums text-brand-500">
                        · dispo {fmtM3(dispo)}
                      </span>
                    )}
                  </>
                }
              >
                <Input
                  variant="quiet"
                  inputMode="decimal"
                  value={r.volumeM3}
                  aria-invalid={over || undefined}
                  onChange={(e) => setRow(i, { volumeM3: normalizeDecimal(e.target.value) })}
                  className={over ? inputErrorCls : ""}
                />
              </Field>
              <Field label="Mode">
                <SelectField
                  value={r.mode}
                  onChange={(v) => setRow(i, { mode: v as Mode })}
                  aria-label={`Mode de prix, ligne ${i + 1}`}
                  options={[
                    { value: "USD", label: "USD × taux" },
                    { value: "CFA", label: "CFA direct" },
                  ]}
                />
              </Field>
              {/* Montant de la ligne : libellé au-dessus comme les champs voisins,
                  la valeur sur la ligne des saisies. */}
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-brand-600">Montant</span>
                <span className="flex min-h-touch items-center font-semibold tabular-nums text-brand-900">
                  {amounts[i] !== null ? fmtFcfa(amounts[i]!) : "—"}
                </span>
              </div>
            </div>

            {/* Prix : libellés visibles (un placeholder disparaît à la frappe), et
                virgule acceptée comme sur les autres saisies décimales. */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {r.mode === "USD" ? (
                <>
                  <Field label="Prix USD/m³">
                    <Input
                      variant="quiet"
                      inputMode="decimal"
                      value={r.priceUsd}
                      onChange={(e) => setRow(i, { priceUsd: normalizeDecimal(e.target.value) })}
                    />
                  </Field>
                  <Field label="Taux FCFA/USD">
                    <Input
                      variant="quiet"
                      inputMode="decimal"
                      value={r.rate}
                      onChange={(e) => setRow(i, { rate: normalizeDecimal(e.target.value) })}
                    />
                  </Field>
                </>
              ) : (
                <Field label="Prix FCFA/m³">
                  <Input
                    variant="quiet"
                    inputMode="decimal"
                    value={r.priceCfa}
                    onChange={(e) => setRow(i, { priceCfa: normalizeDecimal(e.target.value) })}
                  />
                </Field>
              )}
              {/* Une seule ligne : rien à retirer (le bouton ne faisait rien). */}
              {rows.length > 1 && (
                <div className="col-span-2 flex items-end justify-end sm:col-span-1 sm:col-start-4">
                  <Button
                    variant="ghost-danger"
                    size="sm"
                    onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Retirer la ligne${n}`}
                  >
                    Retirer
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <datalist id="stock-sizes">
        {stock.map((s) => (
          <option key={s.code} value={s.code} />
        ))}
      </datalist>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" onClick={() => setRows((p) => [...p, emptyRow(contract)])}>
          <IconPlus width={16} height={16} className="-ml-0.5" />
          Ajouter une ligne
        </Button>
        <div className="text-base">
          <span className="text-brand-600">Total </span>
          <span className="font-semibold tabular-nums text-brand-900">{fmtFcfa(total)}</span>
        </div>
      </div>

      {oversold.length > 0 && (
        <Notice tone="warn" className="mt-3">
          <span className="tabular-nums">
            Stock insuffisant :{" "}
            {oversold
              .map((x) => `${x.code} (demandé ${fmtM3(x.req)}, dispo ${fmtM3(x.dispo!)})`)
              .join(", ")}
          </span>
          <label className="mt-1 flex min-h-touch items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="size-5 accent-accent-600"
            />
            Vendre quand même
          </label>
        </Notice>
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
            {create.isPending ? "Enregistrement…" : "Valider la vente"}
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
  const can = useCan();
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
          can("ventes.create") && (
            <Button size="xs" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
              {showForm ? (
                "Fermer"
              ) : (
                <>
                  <IconPlus width={16} height={16} className="-ml-0.5" />
                  Vente
                </>
              )}
            </Button>
          )
        }
      >
        Ventes{sales.data ? ` (${sales.data.length})` : ""}
      </SectionHeading>

      {showForm && <SaleForm contract={contract} stock={stock} onDone={() => setShowForm(false)} />}

      <div className="space-y-2">
        {sales.isLoading && <SkeletonList count={2} lines={1} />}
        {remove.isError && (
          <FormError>Suppression échouée : {(remove.error as Error).message}</FormError>
        )}
        {sales.isError && (
          <QueryError error={sales.error} onRetry={() => sales.refetch()}>
            Impossible de charger les ventes
          </QueryError>
        )}
        {sales.data?.length === 0 && !showForm && (
          <EmptyState
            action={
              can("ventes.create") ? (
                <Button onClick={() => setShowForm(true)}>Saisir une vente</Button>
              ) : undefined
            }
          >
            Aucune vente sur ce contrat.
          </EmptyState>
        )}
        {sales.data?.map((s) => (
          <div key={s.id} className={`${cardCls} p-3`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm font-medium text-brand-900">
                {new Date(s.saleDate).toLocaleDateString("fr-FR")}
                {clientName(s.clientId) ? ` · ${clientName(s.clientId)}` : ""}
                {s.deliveryNote ? ` · B/L ${s.deliveryNote}` : ""}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm font-semibold tabular-nums text-brand-900">
                  {fmtFcfa(saleTotalCfa(s))}
                </span>
                {can("ventes.delete") && (
                  <button
                    type="button"
                    onClick={() => setDelSale(s)}
                    className="inline-flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-red-100"
                    aria-label={`Supprimer la vente du ${new Date(s.saleDate).toLocaleDateString("fr-FR")}`}
                  >
                    <IconX width={18} height={18} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-1 text-sm tabular-nums text-brand-500">
              <span className="font-medium text-brand-700">{fmtM3(saleTotalM3(s))}</span> ·{" "}
              {s.lines.map((l) => `${l.sizeCode} ${fmtM3(l.volumeM3)}`).join(" · ")}
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
