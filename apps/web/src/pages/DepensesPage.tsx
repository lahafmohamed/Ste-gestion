import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXPENSE_KEYS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type ExpenseRowDTO,
  type PaymentVoucherDTO,
} from "@ste/shared";
import { PageHeader } from "../components/Layout";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { Kpi, KpiStrip } from "../components/ui/Card";
import Chip from "../components/ui/Chip";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DateField from "../components/ui/DateField";
import { EmptyState, FormError, Notice, QueryError } from "../components/ui/Feedback";
import Input, { Field } from "../components/ui/Input";
import SelectField from "../components/ui/SelectField";
import { SkeletonList } from "../components/ui/Skeleton";
import { TableWrap, Td, Th } from "../components/ui/Table";
import Tabs from "../components/ui/Tabs";
import { IconCheck, IconChevronDown, IconPlus } from "../components/icons";
import { expensesApi, vouchersApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtFcfa, normalizeDecimal, todayISO } from "../lib/format";

// ── Dépenses, tous contrats ─────────────────────────────────────────────
// Le bureau règle les dépenses par bon de paiement : un bon = un contrat,
// plusieurs de ses dépenses. On suit ainsi, dépense par dépense, quel bon
// l'a réglée. Deux familles côte à côte : les postes calculés (prix ×
// quantités) et les dépenses ajoutées à la main. Un poste calculé payé dont
// les quantités ont bougé depuis repasse « à payer » pour l'écart seul.

type Filter = "due" | "paid" | "all";
type Tab = "depenses" | "bons" | "comptes";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "due", label: "À payer" },
  { key: "paid", label: "Payées" },
  { key: "all", label: "Toutes" },
];

const TABS = [
  { key: "depenses", label: "Dépenses" },
  { key: "bons", label: "Bons de paiement" },
  { key: "comptes", label: "Comptes" },
] as const;

const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));

function isDue(r: ExpenseRowDTO): boolean {
  return Number(r.due) > 0;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** Montant tapé → nombre (virgule acceptée) ; NaN si vide. */
function parseAmount(v: string): number {
  return v.trim() === "" ? NaN : Number(v.replace(",", "."));
}

function Status({ r }: { r: ExpenseRowDTO }) {
  if (!r.paidAt) return <Badge tone="amber">À payer</Badge>;
  const due = Number(r.due);
  const paid = `Payé ${fmtFcfa(r.paidAmount ?? 0)}`;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {due > 0 ? (
        <Badge tone="amber">Reste {fmtFcfa(due)}</Badge>
      ) : due < 0 ? (
        <Badge tone="parc">Payé +{fmtFcfa(-due)}</Badge>
      ) : (
        <Badge tone="parc">Payé le {fmtDate(r.paidAt)}</Badge>
      )}
      <span className="text-xs tabular-nums text-brand-500">
        {due !== 0 && `${paid} · `}
        {r.vouchers.map((v) => v.number).join(", ")}
      </span>
    </span>
  );
}

// ── Formulaire « Nouveau bon » ──────────────────────────────────────────
// Contrat d'abord, puis ses dépenses. Chaque ligne cochée porte le montant
// réellement payé : proposé au reste dû, modifiable — on paie parfois moins
// (le reste reste à payer), parfois plus (Ibrahim).

function VoucherForm({
  rows,
  initialContractId,
  onDone,
  onCancel,
}: {
  rows: ExpenseRowDTO[];
  initialContractId: string;
  onDone: (number: string) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();

  // Contrats et leur reste à payer (précision de la liste).
  const contracts = useMemo(() => {
    const m = new Map<string, { label: string; due: number }>();
    for (const r of rows) {
      const c = m.get(r.contractId) ?? { label: r.contractCode, due: 0 };
      c.due += Math.max(0, Number(r.due));
      m.set(r.contractId, c);
    }
    return [...m].map(([value, c]) => ({
      value,
      label: c.label,
      hint: c.due > 0 ? `${fmtFcfa(c.due)} à payer` : "à jour",
    }));
  }, [rows]);

  const [contractId, setContractId] = useState(
    contracts.some((c) => c.value === initialContractId) ? initialContractId : ""
  );
  // Ligne cochée → montant payé tapé (chaîne brute du champ).
  const [amounts, setAmounts] = useState<Map<string, string>>(new Map());
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Dépenses à payer d'abord ; les réglées restent payables (un supplément).
  const lines = rows
    .filter((r) => r.contractId === contractId)
    .sort((x, y) => Number(isDue(y)) - Number(isDue(x)));
  const chosen = lines.filter((r) => amounts.has(r.rowId));
  const total = chosen.reduce((s, r) => s + (parseAmount(amounts.get(r.rowId)!) || 0), 0);
  const dueLines = lines.filter(isDue);
  const allOn = dueLines.length > 0 && dueLines.every((r) => amounts.has(r.rowId));

  const create = useMutation({
    mutationFn: vouchersApi.create,
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      onDone(v.number);
    },
    onError: (e: Error) => setError(e.message),
  });

  /** Reste dû proposé comme montant ; vide si la dépense est déjà réglée. */
  function suggested(r: ExpenseRowDTO): string {
    return isDue(r) ? String(Number(r.due)) : "";
  }

  function toggle(r: ExpenseRowDTO, on: boolean) {
    setAmounts((prev) => {
      const next = new Map(prev);
      if (on) next.set(r.rowId, suggested(r));
      else next.delete(r.rowId);
      return next;
    });
  }

  function setAmount(r: ExpenseRowDTO, v: string) {
    setAmounts((prev) => new Map(prev).set(r.rowId, normalizeDecimal(v)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (chosen.length === 0) {
      setError("Cocher au moins une dépense");
      return;
    }
    const bad = chosen.find((r) => !(parseAmount(amounts.get(r.rowId)!) > 0));
    if (bad) {
      setError(`${bad.label} : saisir le montant payé`);
      return;
    }
    create.mutate({
      contractId,
      items: chosen.map((r) => {
        const amount = String(parseAmount(amounts.get(r.rowId)!));
        return r.kind === "extra"
          ? { expenseId: r.expenseId!, amount }
          : { key: r.key!, amount };
      }),
      paidAt: new Date(`${paidAt}T12:00:00`),
      method,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl bg-white p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-brand-900">Nouveau bon de paiement</h2>
        <Button size="xs" onClick={onCancel}>
          Fermer
        </Button>
      </div>

      {contracts.length === 0 ? (
        <p className="mt-3 text-sm text-brand-600">Aucune dépense sur les contrats.</p>
      ) : (
        <>
          <Field label="Contrat" className="mt-3 sm:max-w-xs">
            <SelectField
              value={contractId}
              onChange={(v) => {
                setContractId(v);
                setAmounts(new Map());
              }}
              options={contracts}
              placeholder="Choisir le contrat payé"
              aria-label="Contrat"
            />
          </Field>

          {contractId && (
            <>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <span className="text-sm text-brand-600">
                  Dépenses réglées par ce bon — montant payé modifiable
                </span>
                {dueLines.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setAmounts(
                        allOn ? new Map() : new Map(dueLines.map((r) => [r.rowId, suggested(r)]))
                      )
                    }
                    className="min-h-touch px-2 text-sm font-medium text-accent-700 underline-offset-2 hover:underline"
                  >
                    {allOn ? "Tout décocher" : "Tout cocher"}
                  </button>
                )}
              </div>
              <ul className="mt-1 divide-y divide-brand-100 rounded-lg ring-1 ring-brand-100">
                {lines.map((r) => {
                  const on = amounts.has(r.rowId);
                  const typed = on ? parseAmount(amounts.get(r.rowId)!) : NaN;
                  // Écart entre le payé tapé et le reste dû de la ligne.
                  const gap = Number.isNaN(typed) ? 0 : Number(r.due) - typed;
                  return (
                    <li
                      key={r.rowId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                    >
                      <label className="flex min-h-touch min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-accent-600"
                          checked={on}
                          onChange={(e) => toggle(r, e.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-brand-900">{r.label}</span>
                          {r.detail && (
                            <span className="block truncate text-sm text-brand-500">
                              {r.detail}
                            </span>
                          )}
                          <span className="block text-sm tabular-nums text-brand-600">
                            {isDue(r)
                              ? `Reste dû ${fmtFcfa(r.due)}`
                              : Number(r.due) < 0
                                ? `Déjà payé +${fmtFcfa(-Number(r.due))}`
                                : "Réglée"}
                            {r.paidAmount && ` · déjà payé ${fmtFcfa(r.paidAmount)}`}
                          </span>
                        </span>
                      </label>
                      {/* Largeur sur l'enveloppe : l'Input porte w-full. */}
                      <div className="ml-8 flex w-40 flex-col items-end sm:ml-0">
                        <Input
                          inputMode="decimal"
                          value={on ? amounts.get(r.rowId)! : ""}
                          // Taper un montant coche la ligne.
                          onChange={(e) => setAmount(r, e.target.value)}
                          placeholder={isDue(r) ? String(Number(r.due)) : "Montant"}
                          aria-label={`Montant payé — ${r.label}`}
                          className="text-right tabular-nums"
                        />
                        {on && gap >= 1 && (
                          <span className="mt-0.5 text-xs text-amber-700">
                            reste {fmtFcfa(gap)} à payer
                          </span>
                        )}
                        {on && gap <= -1 && (
                          <span className="mt-0.5 text-xs text-parc-800">
                            +{fmtFcfa(-gap)} au-delà
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Payé le">
                  <DateField value={paidAt} onChange={setPaidAt} max={todayISO()} />
                </Field>
                <Field label="Mode">
                  <SelectField
                    value={method}
                    onChange={(v) => setMethod(v as (typeof PAYMENT_METHODS)[number])}
                    options={METHOD_OPTIONS}
                    aria-label="Mode de paiement"
                  />
                </Field>
                <Field label="Référence" className="col-span-2">
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="N° de chèque, de virement… (facultatif)"
                    maxLength={60}
                  />
                </Field>
                <Field label="Note" className="col-span-2 sm:col-span-4">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Facultatif — à qui, pourquoi"
                    maxLength={300}
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 pt-4">
                <div>
                  <div className="text-sm text-brand-600">
                    Total du bon · {chosen.length} dépense{chosen.length > 1 ? "s" : ""}
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-brand-900">
                    {fmtFcfa(total)}
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={create.isPending || chosen.length === 0}
                >
                  {create.isPending ? "Enregistrement…" : "Enregistrer le bon"}
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </form>
  );
}

// ── Onglet Bons de paiement ─────────────────────────────────────────────

function VoucherList({ contractId, canEdit }: { contractId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [del, setDel] = useState<PaymentVoucherDTO | null>(null);
  const q = useQuery({ queryKey: ["vouchers"], queryFn: vouchersApi.list });

  const remove = useMutation({
    mutationFn: vouchersApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    },
  });

  if (q.isLoading) return <SkeletonList count={3} lines={3} />;
  if (q.isError || !q.data)
    return (
      <QueryError error={q.error} onRetry={() => q.refetch()}>
        Impossible de charger les bons de paiement
      </QueryError>
    );

  const list = contractId ? q.data.filter((v) => v.contractId === contractId) : q.data;
  if (list.length === 0)
    return <EmptyState>Aucun bon de paiement. Un bon règle une ou plusieurs dépenses d'un contrat.</EmptyState>;

  return (
    <>
      {remove.isError && (
        <div className="mb-3">
          <FormError>Annulation échouée : {(remove.error as Error).message}</FormError>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {list.map((v) => (
          <li key={v.id}>
            <Card pad="sm">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-brand-900">{v.number}</span>
                    <Link
                      to={`/contracts/${v.contractId}`}
                      className="font-medium text-accent-700 underline-offset-2 hover:underline"
                    >
                      {v.contractCode}
                    </Link>
                  </div>
                  <div className="text-sm text-brand-600">
                    {fmtDate(v.paidAt)} · {PAYMENT_METHOD_LABELS[v.method]}
                    {v.creditFrom && ` depuis ${v.creditFrom.contractCode}`}
                    {v.reference && ` n° ${v.reference}`}
                    {v.createdBy && ` · saisi par ${v.createdBy}`}
                  </div>
                  {v.note && <div className="text-sm text-brand-500">{v.note}</div>}
                </div>
                <div className="text-lg font-semibold tabular-nums text-brand-900">
                  {fmtFcfa(v.total)}
                </div>
              </div>
              <ul className="mt-2 border-t border-brand-100 pt-2 text-sm">
                {v.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 py-0.5">
                    <span className="text-brand-700">{l.label}</span>
                    <span className="tabular-nums text-brand-700">{fmtFcfa(l.amount)}</span>
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="mt-2 flex justify-end">
                  <Button size="xs" variant="ghost-danger" onClick={() => setDel(v)}>
                    Annuler le bon
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={del !== null}
        title={`Annuler le bon ${del?.number ?? ""} ?`}
        confirmLabel="Annuler le bon"
        pending={remove.isPending}
        onConfirm={() => {
          if (del) remove.mutate(del.id);
          setDel(null);
        }}
        onCancel={() => setDel(null)}
      >
        {del
          ? `${del.contractCode} — ${fmtFcfa(del.total)}. Ses ${del.lines.length} dépense${
              del.lines.length > 1 ? "s repassent" : " repasse"
            } à payer.`
          : null}
      </ConfirmDialog>
    </>
  );
}

// ── Onglet Comptes ──────────────────────────────────────────────────────
// Un compte par poste fixe (SODEFOR, Ibrahim, Transport…), suivi sur tous les
// contrats : dû cumulé, payé cumulé, solde. Solde positif = on lui doit ;
// négatif (payé au-delà, Ibrahim) = il nous doit. Dérivé des lignes de la
// page : rien de stocké en plus.

type Account = {
  key: string;
  label: string;
  rows: ExpenseRowDTO[];
  amount: number;
  paid: number;
  balance: number;
};

function buildAccounts(rows: ExpenseRowDTO[]): Account[] {
  const byKey = new Map<string, ExpenseRowDTO[]>();
  for (const r of rows) {
    if (r.kind !== "computed" || !r.key) continue;
    const g = byKey.get(r.key);
    if (g) g.push(r);
    else byKey.set(r.key, [r]);
  }
  return EXPENSE_KEYS.flatMap((key) => {
    const g = byKey.get(key);
    if (!g) return [];
    const amount = g.reduce((s, r) => s + Number(r.amount), 0);
    const paid = g.reduce((s, r) => s + Number(r.paidAmount ?? 0), 0);
    const balance = Math.abs(amount - paid) < 1 ? 0 : amount - paid;
    return [{ key, label: g[0].label, rows: g, amount, paid, balance }];
  });
}

function BalanceBadge({ balance, size }: { balance: number; size?: "sm" | "md" }) {
  if (balance > 0)
    return (
      <Badge tone="amber" size={size}>
        On lui doit {fmtFcfa(balance)}
      </Badge>
    );
  if (balance < 0)
    return (
      <Badge tone="parc" size={size}>
        Il nous doit {fmtFcfa(-balance)}
      </Badge>
    );
  return (
    <Badge tone="brand" size={size}>
      À jour
    </Badge>
  );
}

// ── Report d'un trop-payé ───────────────────────────────────────────────
// Le compte « nous doit » sur un contrat (payé au-delà) et « on lui doit » sur
// un autre : on reporte le crédit plutôt que de se faire rembourser. Même
// poste des deux côtés ; le bon créé (mode Report) trace l'opération.

function TransferForm({
  label,
  from,
  targets,
  onDone,
  onCancel,
}: {
  label: string;
  /** Ligne source : son `due` est négatif (crédit). */
  from: ExpenseRowDTO;
  /** Lignes du même compte où il reste à payer. */
  targets: ExpenseRowDTO[];
  onDone: (number: string) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const credit = -Number(from.due);
  const [toContractId, setToContractId] = useState(targets[0]?.contractId ?? "");
  const target = targets.find((t) => t.contractId === toContractId);
  const [amount, setAmount] = useState(() =>
    String(Math.min(credit, Number(targets[0]?.due ?? credit)))
  );
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const transfer = useMutation({
    mutationFn: vouchersApi.transfer,
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      onDone(v.number);
    },
    onError: (e: Error) => setError(e.message),
  });

  function pickTarget(id: string) {
    setToContractId(id);
    const t = targets.find((x) => x.contractId === id);
    if (t) setAmount(String(Math.min(credit, Number(t.due))));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = parseAmount(amount);
    if (!(n > 0)) return setError("Montant requis");
    if (n > credit + 0.5) return setError(`${from.contractCode} ne nous doit que ${fmtFcfa(credit)}`);
    if (!toContractId) return setError("Choisir le contrat cible");
    transfer.mutate({
      key: from.key!,
      fromContractId: from.contractId,
      toContractId,
      amount: String(n),
      transferredAt: new Date(`${date}T12:00:00`),
      note: note.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-lg bg-brand-50 p-3 ring-1 ring-inset ring-brand-100"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-brand-900">
          Reporter le trop-payé de {from.contractCode} — {label}
        </span>
        <span className="text-sm tabular-nums text-brand-600">
          il nous doit {fmtFcfa(credit)}
        </span>
      </div>
      {targets.length === 0 ? (
        <p className="mt-2 text-sm text-brand-600">
          Aucun autre contrat où ce compte reste à payer.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Vers le contrat" className="col-span-2">
            <SelectField
              value={toContractId}
              onChange={pickTarget}
              options={targets.map((t) => ({
                value: t.contractId,
                label: t.contractCode,
                hint: `on lui doit ${fmtFcfa(t.due)}`,
              }))}
              aria-label="Contrat cible"
            />
          </Field>
          <Field label="Montant reporté">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(normalizeDecimal(e.target.value))}
              className="text-right tabular-nums"
            />
          </Field>
          <Field label="Date">
            <DateField value={date} onChange={setDate} max={todayISO()} />
          </Field>
          <Field label="Note" className="col-span-2 sm:col-span-3">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Facultatif"
              maxLength={300}
            />
          </Field>
          <div className="col-span-2 flex items-end justify-end gap-2 sm:col-span-1">
            <Button onClick={onCancel}>Annuler</Button>
            <Button type="submit" variant="primary" disabled={transfer.isPending}>
              {transfer.isPending ? "Report…" : "Reporter"}
            </Button>
          </div>
          {target && parseAmount(amount) > 0 && (
            <p className="col-span-2 text-xs tabular-nums text-brand-600 sm:col-span-4">
              Après report : {from.contractCode} nous devra{" "}
              {fmtFcfa(Math.max(0, credit - parseAmount(amount)))}, on devra{" "}
              {fmtFcfa(Math.max(0, Number(target.due) - parseAmount(amount)))} sur{" "}
              {target.contractCode}.
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="mt-2">
          <FormError>{error}</FormError>
        </div>
      )}
    </form>
  );
}

function AccountList({
  rows,
  contractId,
  canEdit,
  onTransferred,
}: {
  /** Toutes les lignes : un compte se lit sur tous les contrats à la fois. */
  rows: ExpenseRowDTO[];
  /** Filtre de page : ne montre que les comptes où ce contrat apparaît. */
  contractId: string;
  canEdit: boolean;
  onTransferred: (number: string) => void;
}) {
  const accounts = useMemo(
    () =>
      buildAccounts(rows).filter(
        (a) => !contractId || a.rows.some((r) => r.contractId === contractId)
      ),
    [rows, contractId]
  );
  const [open, setOpen] = useState<string | null>(null);
  // Ligne source du report en cours (rowId), une à la fois.
  const [transferFrom, setTransferFrom] = useState<string | null>(null);

  if (accounts.length === 0)
    return (
      <EmptyState>
        Aucun compte : les postes de prix des contrats (SODEFOR, Ibrahim, transport…)
        apparaissent ici dès qu'un prix est renseigné.
      </EmptyState>
    );

  const weOwe = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const owedToUs = accounts.reduce((s, a) => s + Math.max(0, -a.balance), 0);
  const nOwe = accounts.filter((a) => a.balance > 0).length;
  const nOwed = accounts.filter((a) => a.balance < 0).length;

  return (
    <>
      <KpiStrip cols={3} className="tabular-nums">
        <Kpi
          bare
          label="On leur doit"
          value={fmtFcfa(weOwe)}
          hint={`${nOwe} compte${nOwe > 1 ? "s" : ""}`}
          tone="accent"
        />
        <Kpi
          bare
          label="Ils nous doivent"
          value={fmtFcfa(owedToUs)}
          hint={`${nOwed} compte${nOwed > 1 ? "s" : ""}`}
          tone="parc"
        />
        <Kpi bare label="Payé en tout" value={fmtFcfa(accounts.reduce((s, a) => s + a.paid, 0))} />
      </KpiStrip>

      <ul className="mt-4 flex flex-col gap-3">
        {accounts.map((a) => {
          const shown = open === a.key;
          return (
            <li key={a.key}>
              <Card pad="sm">
                <button
                  type="button"
                  onClick={() => setOpen(shown ? null : a.key)}
                  aria-expanded={shown}
                  className="flex min-h-touch w-full flex-wrap items-center gap-x-4 gap-y-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-brand-900">{a.label}</span>
                    <span className="block text-sm tabular-nums text-brand-600">
                      Dû {fmtFcfa(a.amount)} · payé {fmtFcfa(a.paid)} · {a.rows.length} contrat
                      {a.rows.length > 1 ? "s" : ""}
                    </span>
                  </span>
                  <BalanceBadge balance={a.balance} size="md" />
                  <IconChevronDown
                    width={18}
                    height={18}
                    className={`shrink-0 text-brand-500 transition-transform duration-150${
                      shown ? " rotate-180" : ""
                    }`}
                  />
                </button>
                {shown && (
                  <TableWrap className="mt-2 border-t border-brand-100 pt-2">
                    <table className="w-full min-w-[520px] text-base">
                      <thead className="text-left text-sm text-brand-500">
                        <tr>
                          <Th>Contrat</Th>
                          <Th>Quantité</Th>
                          <Th right>Dû</Th>
                          <Th right>Payé</Th>
                          <Th className="pr-0 text-right">Solde</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.rows.map((r) => (
                          <tr key={r.rowId} className="border-t border-brand-100">
                            <Td>
                              <Link
                                to={`/contracts/${r.contractId}`}
                                className="font-medium text-brand-900 underline-offset-2 hover:underline"
                              >
                                {r.contractCode}
                              </Link>
                              {r.contractStatus === "CLOSED" && <Badge className="ml-2">Clôturé</Badge>}
                            </Td>
                            <Td className="text-sm text-brand-500">{r.detail}</Td>
                            <Td num>{fmtFcfa(r.amount)}</Td>
                            <Td num>{r.paidAmount ? fmtFcfa(r.paidAmount) : "—"}</Td>
                            <Td className="py-1.5 pr-0 text-right">
                              <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                <BalanceBadge balance={Number(r.due)} />
                                {canEdit && Number(r.due) < 0 && a.rows.some((t) => Number(t.due) > 0) && (
                                  <Button
                                    size="xs"
                                    onClick={() =>
                                      setTransferFrom(transferFrom === r.rowId ? null : r.rowId)
                                    }
                                    aria-expanded={transferFrom === r.rowId}
                                  >
                                    Transférer
                                  </Button>
                                )}
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-brand-200 font-semibold text-brand-900">
                          <Td colSpan={2}>Total</Td>
                          <Td num>{fmtFcfa(a.amount)}</Td>
                          <Td num>{fmtFcfa(a.paid)}</Td>
                          <Td className="py-1.5 pr-0 text-right">
                            <BalanceBadge balance={a.balance} />
                          </Td>
                        </tr>
                      </tfoot>
                    </table>
                  </TableWrap>
                )}
                {shown &&
                  transferFrom &&
                  (() => {
                    const from = a.rows.find((r) => r.rowId === transferFrom);
                    if (!from) return null;
                    return (
                      <TransferForm
                        key={from.rowId}
                        label={a.label}
                        from={from}
                        targets={a.rows.filter((t) => Number(t.due) > 0)}
                        onCancel={() => setTransferFrom(null)}
                        onDone={(n) => {
                          setTransferFrom(null);
                          onTransferred(n);
                        }}
                      />
                    );
                  })()}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function DepensesPage() {
  const can = useCan();
  const canEdit = can("finances.edit");
  const [tab, setTab] = useState<Tab>("depenses");
  const [filter, setFilter] = useState<Filter>("due");
  const [contractId, setContractId] = useState("");
  // null = formulaire fermé ; sinon contrat présélectionné ("" = à choisir).
  const [formFor, setFormFor] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const q = useQuery({ queryKey: ["expenses", "all"], queryFn: expensesApi.all });
  const rows = q.data ?? [];

  useEffect(() => {
    if (formFor !== null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [formFor]);

  function openForm(cid: string) {
    setSaved(null);
    setFormFor(cid);
  }

  const contracts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.contractId, r.contractCode);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const inContract = contractId ? rows.filter((r) => r.contractId === contractId) : rows;
  const visible = inContract.filter((r) =>
    filter === "due" ? isDue(r) : filter === "paid" ? r.paidAt !== null : true
  );

  // Chiffres-clés sur le contrat filtré, tous statuts confondus.
  // Un trop-payé (Ibrahim) ne vient pas réduire ce qui reste dû ailleurs.
  const totalDue = inContract.reduce((s, r) => s + Math.max(0, Number(r.due)), 0);
  const totalPaid = inContract.reduce((s, r) => s + Number(r.paidAmount ?? 0), 0);
  const totalAmount = inContract.reduce((s, r) => s + Number(r.amount), 0);
  const overpaid = inContract.reduce((s, r) => s + Math.max(0, -Number(r.due)), 0);
  const dueCount = inContract.filter(isDue).length;

  // Groupes par contrat, dans l'ordre de l'API (contrats récents d'abord).
  const groups = useMemo(() => {
    const m = new Map<string, ExpenseRowDTO[]>();
    for (const r of visible) {
      const g = m.get(r.contractId);
      if (g) g.push(r);
      else m.set(r.contractId, [r]);
    }
    return [...m.values()];
  }, [visible]);

  return (
    <>
      <PageHeader
        title="Dépenses"
        subtitle="Dépenses de tous les contrats, réglées par bon de paiement."
        right={
          canEdit && formFor === null ? (
            <Button variant="primary" onClick={() => openForm(contractId)}>
              <IconPlus width={16} height={16} className="-ml-0.5" />
              Nouveau bon
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        {q.isLoading ? (
          <SkeletonList count={3} lines={4} />
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={() => q.refetch()}>
            Impossible de charger les dépenses
          </QueryError>
        ) : (
          <>
            {saved && (
              <Notice icon={IconCheck} className="mb-4">
                Bon {saved} enregistré.{" "}
                <button
                  type="button"
                  onClick={() => setTab("bons")}
                  className="font-medium underline underline-offset-2 hover:text-brand-900"
                >
                  Voir les bons
                </button>
              </Notice>
            )}

            {formFor !== null && (
              <div ref={formRef} className="mb-6 scroll-mt-header">
                <VoucherForm
                  key={formFor}
                  rows={rows}
                  initialContractId={formFor}
                  onCancel={() => setFormFor(null)}
                  onDone={(n) => {
                    setFormFor(null);
                    setSaved(n);
                  }}
                />
              </div>
            )}

            <KpiStrip cols={3} stack className="tabular-nums">
              <Kpi
                bare
                label="À payer"
                value={fmtFcfa(totalDue)}
                hint={`${dueCount} ligne${dueCount > 1 ? "s" : ""}`}
                tone="accent"
              />
              <Kpi
                bare
                label="Payé"
                value={fmtFcfa(totalPaid)}
                hint={overpaid > 0 ? `dont ${fmtFcfa(overpaid)} au-delà du dû` : undefined}
              />
              <Kpi bare label="Total des dépenses" value={fmtFcfa(totalAmount)} />
            </KpiStrip>

            {/* Téléphone : le filtre de contrat passe sous les onglets — sur la
                même ligne il recouvrait « Bons de paiement ». */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Tabs tabs={TABS} value={tab} onChange={setTab} label="Vue" className="min-w-0 sm:flex-1" />
              {contracts.length > 1 && (
                <SelectField
                  width="auto"
                  value={contractId}
                  onChange={setContractId}
                  options={contracts}
                  placeholder="Tous les contrats"
                  aria-label="Contrat"
                />
              )}
            </div>

            {tab === "bons" ? (
              <div className="mt-4">
                <VoucherList contractId={contractId} canEdit={canEdit} />
              </div>
            ) : tab === "comptes" ? (
              <div className="mt-4">
                <AccountList
                  rows={rows}
                  contractId={contractId}
                  canEdit={canEdit}
                  onTransferred={setSaved}
                />
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Statut">
                  {FILTERS.map((f) => (
                    <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
                      {f.label}
                    </Chip>
                  ))}
                </div>

                {groups.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState>
                      {filter === "due"
                        ? "Rien à payer : toutes les dépenses sont réglées."
                        : filter === "paid"
                          ? "Aucune dépense payée pour l'instant."
                          : "Aucune dépense. Les prix des termes et les dépenses ajoutées des contrats apparaissent ici."}
                    </EmptyState>
                  </div>
                ) : (
                  groups.map((g) => {
                    const c = g[0];
                    const groupDue = g.reduce((s, r) => s + Math.max(0, Number(r.due)), 0);
                    return (
                      <section key={c.contractId} className="mt-6">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                          <h2 className="flex items-center gap-2 text-base font-semibold text-brand-900">
                            <Link
                              to={`/contracts/${c.contractId}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {c.contractCode}
                            </Link>
                            {c.contractStatus === "CLOSED" && <Badge>Clôturé</Badge>}
                          </h2>
                          {groupDue > 0 && (
                            <div className="flex items-center gap-3">
                              <span className="text-sm tabular-nums text-brand-600">
                                {fmtFcfa(groupDue)} à payer
                              </span>
                              {canEdit && (
                                <Button size="xs" onClick={() => openForm(c.contractId)}>
                                  Payer
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Colonnes à largeur fixe : les tableaux des contrats
                            s'empilent et leurs colonnes tombent sur les mêmes
                            lignes. Téléphone : deux colonnes seulement — la date
                            passe sous le libellé, le statut sous le montant
                            (avant, le montant fuyait hors champ à droite). */}
                        <Card pad="sm">
                          <table className="w-full table-fixed text-base">
                            <thead className="text-left text-sm text-brand-500">
                              <tr>
                                <Th>Dépense</Th>
                                <Th className="hidden w-28 sm:table-cell">Date</Th>
                                <Th right className="w-40 pr-0 sm:pr-3">Montant</Th>
                                <Th className="hidden w-60 pr-0 text-right sm:table-cell">Statut</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.map((r) => (
                                <tr key={r.rowId} className="border-t border-brand-100 align-top sm:align-middle">
                                  <Td className="py-2 sm:py-1">
                                    <span className="font-medium text-brand-900">{r.label}</span>
                                    {r.kind === "computed" && (
                                      <span className="ml-2 text-xs text-brand-500">calculée</span>
                                    )}
                                    {r.detail && (
                                      <div className="text-sm text-brand-500">{r.detail}</div>
                                    )}
                                    {r.date && (
                                      <div className="text-sm tabular-nums text-brand-500 sm:hidden">
                                        {fmtDate(r.date)}
                                      </div>
                                    )}
                                  </Td>
                                  <Td className="hidden whitespace-nowrap text-sm tabular-nums text-brand-500 sm:table-cell">
                                    {r.date ? fmtDate(r.date) : "—"}
                                  </Td>
                                  <Td num className="py-2 pr-0 font-medium sm:py-1 sm:pr-3">
                                    <div className="whitespace-nowrap">{fmtFcfa(r.amount)}</div>
                                    <div className="mt-1 sm:hidden">
                                      <Status r={r} />
                                    </div>
                                  </Td>
                                  <Td className="hidden py-1.5 pr-0 text-right sm:table-cell">
                                    <Status r={r} />
                                  </Td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Card>
                      </section>
                    );
                  })
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
